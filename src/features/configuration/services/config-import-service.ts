import Database from "@tauri-apps/plugin-sql";
import {getDb} from "../../../services/db.ts";
import {refreshMyProduitProgrammeNiveau} from "../../organisation-units/organisation-units-service.ts";
import {refreshRapportFsStatus} from "../../rapports/services/rapportfs-service.ts";
import type {ConfigFile, ConfigProduit, ConfigTombstone} from "../models/config-model.ts";
import {THIS_APP} from "../models/this-app.ts";
import {getConfigVersion, setConfigVersion} from "./config-version-service.ts";

// Stay comfortably under SQLite's default 999-bound-variable limit per statement.
const MAX_PARAMS_PER_STATEMENT = 900;

async function bulkInsert(
    db: Database,
    table: string,
    columns: string[],
    rows: unknown[][],
): Promise<void> {
    if (rows.length === 0) return;

    const rowsPerChunk = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / columns.length));
    for (let i = 0; i < rows.length; i += rowsPerChunk) {
        const chunk = rows.slice(i, i + rowsPerChunk);
        const values: unknown[] = [];
        const placeholders = chunk
            .map((row) => {
                const start = values.length;
                values.push(...row);
                return `(${row.map((_, j) => `$${start + j + 1}`).join(", ")})`;
            })
            .join(", ");
        await db.execute(`INSERT INTO ${table} (${columns.join(", ")})
                          VALUES ${placeholders}`, values);
    }
}

// Same as bulkInsert, but upserts by the first column (the primary key)
// instead of assuming an empty table. Used for reference tables that other
// tables (my_organisation_unit, rapportfs_ligne, my_produitprogrammeniveau)
// hold live foreign keys into — a blind DELETE-all would violate those
// constraints, whereas upserting by stable id never removes a referenced row.
async function bulkUpsert(
    db: Database,
    table: string,
    columns: string[],
    rows: unknown[][],
): Promise<void> {
    if (rows.length === 0) return;

    const [pk, ...updateColumns] = columns;
    const conflictClause = updateColumns.length
        ? `ON CONFLICT(${pk}) DO UPDATE SET ${updateColumns.map((c) => `${c} = excluded.${c}`).join(", ")}`
        : `ON CONFLICT(${pk}) DO NOTHING`;

    const rowsPerChunk = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / columns.length));
    for (let i = 0; i < rows.length; i += rowsPerChunk) {
        const chunk = rows.slice(i, i + rowsPerChunk);
        const values: unknown[] = [];
        const placeholders = chunk
            .map((row) => {
                const start = values.length;
                values.push(...row);
                return `(${row.map((_, j) => `$${start + j + 1}`).join(", ")})`;
            })
            .join(", ");
        await db.execute(
            `INSERT INTO ${table} (${columns.join(", ")})
             VALUES ${placeholders} ${conflictClause}`,
            values,
        );
    }
}

// Which table each kind of tombstone marks. Marking, never deleting: a report
// already captured against a withdrawn produit must keep displaying it, and the
// foreign keys from rapportfs_ligne would refuse the delete anyway.
const TOMBSTONE_TABLES: Record<ConfigTombstone["type"], string[]> = {
    produit: ["produit"],
    programme: ["programme"],
    organisation_unit_group: ["organisation_unit_group"],
    // The device's own materialised subset has to be marked alongside the full
    // table, or an archived produit would go on being offered for collection.
    produit_programme_niveau: ["produit_programme_niveau", "my_produitprogrammeniveau"],
};

async function applyTombstones(db: Database, tombstones: ConfigTombstone[]): Promise<number> {
    let marked = 0;
    for (const tombstone of tombstones) {
        const tables = TOMBSTONE_TABLES[tombstone.type];
        if (!tables) continue;
        for (const table of tables) {
            await db.execute(
                `UPDATE ${table}
                 SET active      = 0,
                     archived_at = COALESCE(archived_at, $1)
                 WHERE id = $2`,
                [tombstone.archived_at, tombstone.id],
            );
        }
        marked += 1;
    }
    return marked;
}

/** Configuration 0015's test for "the same produit": names compared with whitespace
 *  collapsed and case ignored. */
function produitKey(name: string): string {
    return name.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

interface PpnIdentityRow {
    id: string;
    produit_id: string;
    programme_id: string;
    active: number;
    produit_name: string;
    report_unit: string | null;
    report_unit_id: string | null;
}

interface LigneToMoveRow {
    id: string;
    rapportfs_id: string;
    produit_unit: string;
    cmm: number | null;
    cmma: number | null;
}

interface SurvivorLigneRow {
    id: string;
    qte_dispo_deb_mois: number | null;
    qte_rec_mois: number | null;
    qte_dist_patient: number | null;
    sdu_fin_mois: number | null;
    detail_count: number;
}

/**
 * Moves report lines off withdrawn produit_programme_niveau rows onto the active row
 * for the same produit × programme, the way the server's aliases do.
 *
 * A report collects a produit once per programme. The server used to configure a
 * produit once per organisation unit group, and kept same-named copies of a produit
 * per group (CEFTRIAXONE 1G for CSB and again for HOPITAUX); it then folded those
 * into one row per produit × programme, keeping the CSB copy (configuration 0010 and
 * 0015). A device only hears of that as tombstones on the rows it held, so a report
 * that had captured one went on showing it, "Retiré", beside the row that replaced it
 * — the same produit twice — and the CMM and the carried-over opening stock, which
 * follow a row's id from month to month, lost its history.
 *
 * The configuration does not ship the server's aliases, but they follow from what the
 * device holds: the replacement is the active row of the same programme for the same
 * produit — by id, or, for a merged-away copy whose produit the server deleted, by
 * name (produit names are unique among active produits). Only an unambiguous match is
 * used. A line that would land on a report already holding a filled-in line for the
 * replacement stays where it is, as on the server; one holding only a placeholder (CMM
 * written ahead of any figures) gives way to the line with the figures.
 *
 * Idempotent: once moved, a line is on an active row and is not looked at again.
 * Returns the ids of the reports whose lines moved.
 */
async function reattachWithdrawnLines(db: Database): Promise<string[]> {
    const rows = await db.select<PpnIdentityRow[]>(
        `SELECT ppn.id, ppn.produit_id, ppn.programme_id, ppn.active, p.name AS produit_name,
                ppn.report_unit, ppn.report_unit_id
         FROM produit_programme_niveau ppn
                  JOIN produit p ON p.id = ppn.produit_id`,
    );

    const activeByProduit = new Map<string, PpnIdentityRow>();
    const activeByName = new Map<string, PpnIdentityRow[]>();
    for (const row of rows) {
        if (!row.active) continue;
        activeByProduit.set(`${row.programme_id}\u0000${row.produit_id}`, row);
        const key = `${row.programme_id}\u0000${produitKey(row.produit_name)}`;
        activeByName.set(key, [...(activeByName.get(key) ?? []), row]);
    }

    const touched = new Set<string>();
    for (const withdrawn of rows) {
        if (withdrawn.active) continue;
        const byName = activeByName.get(`${withdrawn.programme_id}\u0000${produitKey(withdrawn.produit_name)}`) ?? [];
        const target =
            activeByProduit.get(`${withdrawn.programme_id}\u0000${withdrawn.produit_id}`) ??
            (byName.length === 1 ? byName[0] : undefined);
        if (!target) continue;

        const lignes = await db.select<LigneToMoveRow[]>(
            `SELECT id, rapportfs_id, produit_unit, cmm, cmma
             FROM rapportfs_ligne
             WHERE produit_programme_niveau_id = $1`,
            [withdrawn.id],
        );
        for (const ligne of lignes) {
            const [existing] = await db.select<SurvivorLigneRow[]>(
                `SELECT l.id, l.qte_dispo_deb_mois, l.qte_rec_mois, l.qte_dist_patient, l.sdu_fin_mois,
                        (SELECT COUNT(*) FROM detail_sdu d WHERE d.rapportfs_ligne_id = l.id) AS detail_count
                 FROM rapportfs_ligne l
                 WHERE l.rapportfs_id = $1
                   AND l.produit_programme_niveau_id = $2`,
                [ligne.rapportfs_id, target.id],
            );
            let cmm = ligne.cmm;
            let cmma = ligne.cmma;
            if (existing) {
                const placeholder =
                    existing.qte_dispo_deb_mois === null &&
                    existing.qte_rec_mois === null &&
                    existing.qte_dist_patient === null &&
                    existing.sdu_fin_mois === null &&
                    existing.detail_count === 0;
                if (!placeholder) continue;
                const [kept] = await db.select<{ cmm: number | null; cmma: number | null }[]>(
                    "SELECT cmm, cmma FROM rapportfs_ligne WHERE id = $1",
                    [existing.id],
                );
                cmm = cmm ?? kept?.cmm ?? null;
                cmma = cmma ?? kept?.cmma ?? null;
                await db.execute("DELETE FROM rapportfs_ligne WHERE id = $1", [existing.id]);
            }

            // The line keeps the labels it was captured with. Its unit id was the old
            // copy's, which the server no longer has: it becomes the replacement's when
            // the line was in that unit, and is otherwise left for the server to match
            // by the line's unit label.
            await db.execute(
                `UPDATE rapportfs_ligne
                 SET produit_programme_niveau_id = $1,
                     produit_unit_id             = $2,
                     cmm                         = $3,
                     cmma                        = $4
                 WHERE id = $5`,
                [
                    target.id,
                    ligne.produit_unit === target.report_unit ? target.report_unit_id : null,
                    cmm,
                    cmma,
                    ligne.id,
                ],
            );
            touched.add(ligne.rapportfs_id);
        }
    }
    return [...touched];
}

/**
 * The unit this app reports a produit_programme_niveau in: the one the Assignation
 * names for THIS_APP and that row, else its produit's reference unit. Per row, not per
 * produit — the row is what reports are collected against. Its id travels on every
 * report line (produit_unit_id), its name is what the forms show. A schema 5 file has
 * no units: the reference unit's name, and no id.
 */
function reportedUnit(produit: ConfigProduit | undefined, unitId: string | undefined): { id: string | null; name: string | null } {
    if (!produit) return {id: null, name: null};
    const units = produit.units ?? [];
    const unit =
        units.find((candidate) => candidate.id === unitId) ??
        units.find((candidate) => candidate.name === produit.unit);
    return unit ? {id: unit.id, name: unit.name} : {id: null, name: produit.unit};
}

export async function importConfig(config: ConfigFile): Promise<string> {
    const db = await getDb();

    // Configuration is forward-only. Re-importing the same version is fine (a
    // device may need to be restored), but going backwards would resurrect
    // produits the server has already withdrawn and silently disagree with
    // every report stamped since.
    const installed = await getConfigVersion();
    if (installed && config.version < installed.version) {
        throw new Error(
            `Ce fichier est une configuration plus ancienne (v${config.version}) que celle ` +
            `installée (v${installed.version}). Les configurations ne reviennent pas en ` +
            "arrière : exportez la version courante depuis le serveur.",
        );
    }

    // organisation_units, produit, programme and produit_programme_niveau are
    // upserted (never deleted) because my_organisation_unit, rapportfs_ligne
    // and my_produitprogrammeniveau hold live foreign keys into them — sqlx
    // enables `PRAGMA foreign_keys` by default, so deleting a still-referenced
    // row would fail with SQLITE_CONSTRAINT_FOREIGNKEY. Ids are stable across
    // exports of the same server data, so upserting keeps existing references
    // valid while still picking up renamed/moved entries.
    //
    // organisation_unit_group and category (and their members) have no
    // dependents, so they're simply replaced wholesale.
    await db.execute("DELETE FROM organisation_unit_group_member");
    await db.execute("DELETE FROM organisation_unit_group");
    await db.execute("DELETE FROM category_member");
    await db.execute("DELETE FROM category");
    await db.execute("DELETE FROM app_category");

    // What the file does not list is no longer collected. The server publishes only
    // the active produits, programmes and produit × programme rows, but tombstones
    // only what it archived itself: the rows of an archived produit or programme, and
    // the produits it merged away, are simply absent. Left active here, they went on
    // being offered. So everything is marked withdrawn first, and the upserts below
    // bring back exactly what the file carries; a row withdrawn earlier keeps the
    // date it was withdrawn on.
    const withdrawnAt = config.published_at ?? new Date().toISOString();
    for (const table of ["produit", "programme", "produit_programme_niveau"]) {
        await db.execute(
            `UPDATE ${table}
             SET active      = 0,
                 archived_at = COALESCE(archived_at, $1)
             WHERE active = 1`,
            [withdrawnAt],
        );
    }

    // Sorted by level so every parent row is upserted before its children —
    // organisation_units.parent_id is a self-referencing foreign key.
    const sortedOrganisationUnits = [...config.organisation_units].sort((a, b) => a.level - b.level);
    await bulkUpsert(
        db,
        "organisation_units",
        ["id", "name", "level", "parent_id"],
        sortedOrganisationUnits.map((o) => [o.id, o.name, o.level, o.parent_id]),
    );

    // `active`/`archived_at` are part of the upsert so that a row the server has
    // brought back is un-archived here too; the tombstone pass below then
    // archives whatever the file says is withdrawn.
    await bulkUpsert(
        db,
        "produit",
        ["id", "name", "unit", "code", "uuid_dhis2", "active", "archived_at"],
        config.produits.map((p) => [p.id, p.name, p.unit, p.code, p.uuid_dhis2, 1, null]),
    );

    await bulkUpsert(
        db,
        "programme",
        ["id", "name", "active", "archived_at"],
        config.programmes.map((p) => [p.id, p.name, 1, null]),
    );

    // org_group_id / org_group_name are legacy NOT NULL columns (see migration
    // category_only): the name carries the row's categories, which every screen
    // shows as the niveau, and the id carries the row's own id so the old
    // UNIQUE (produit, programme, org_group_id) never binds.
    // produit_programme_niveau_category decides which FS owe the row.
    //
    // report_unit / report_unit_id: the unit this app reports the row in (see
    // reportedUnit) — every new report line copies them.
    const categoryNames = new Map(config.categories.map((c) => [c.id, c.name]));
    const produitsById = new Map(config.produits.map((p) => [p.id, p]));
    const ownApp = (config.apps ?? []).find((app) => app.code === THIS_APP);
    const assignedUnits = new Map((ownApp?.ppn_units ?? []).map((row) => [row.ppn_id, row.unit_id]));
    await bulkUpsert(
        db,
        "produit_programme_niveau",
        ["id", "produit_id", "programme_id", "org_group_id", "org_group_name", '"order"', "report_unit",
            "report_unit_id", "active", "archived_at"],
        config.produit_programme_niveau.map((p) => {
            const unit = reportedUnit(produitsById.get(p.produit_id), assignedUnits.get(p.id));
            return [
                p.id,
                p.produit_id,
                p.programme_id,
                p.id,
                p.category_ids.map((id) => categoryNames.get(id) ?? id).sort().join(", "),
                p.order,
                unit.name,
                unit.id,
                1,
                null,
            ];
        }),
    );

    // Only the rows the file carries have their categories replaced. An archived
    // row keeps the categories it was withdrawn with: dropping them would make it
    // read as owed by every facility of its type for the months it still covers.
    const ppnIds = config.produit_programme_niveau.map((p) => p.id);
    for (let i = 0; i < ppnIds.length; i += MAX_PARAMS_PER_STATEMENT) {
        const chunk = ppnIds.slice(i, i + MAX_PARAMS_PER_STATEMENT);
        await db.execute(
            `DELETE FROM produit_programme_niveau_category
             WHERE ppn_id IN (${chunk.map((_, j) => `$${j + 1}`).join(", ")})`,
            chunk,
        );
    }
    await bulkInsert(
        db,
        "produit_programme_niveau_category",
        ["ppn_id", "category_id"],
        config.produit_programme_niveau.flatMap((p) => p.category_ids.map((categoryId) => [p.id, categoryId])),
    );

    await bulkInsert(
        db,
        "category",
        ["id", "name"],
        config.categories.map((c) => [c.id, c.name]),
    );
    await bulkInsert(
        db,
        "category_member",
        ["category_id", "ou_id"],
        config.categories.flatMap((c) => c.organisation_units.map((ouId) => [c.id, ouId])),
    );

    // Every app's roster, not only this one's: GAS-District also reads GAS-PhaGDis's.
    await bulkInsert(
        db,
        "app_category",
        ["app", "category_id"],
        (config.apps ?? []).flatMap((app) => app.category_ids.map((categoryId) => [app.code, categoryId])),
    );

    await bulkInsert(
        db,
        "organisation_unit_group",
        ["id", "name", "short_name", "active", "archived_at"],
        config.organisation_unit_groups.map((g) => [g.id, g.name, g.short_name, 1, null]),
    );

    const memberRows: [string, string][] = [];
    for (const group of config.organisation_unit_groups) {
        for (const ouId of group.organisation_units) {
            memberRows.push([group.id, ouId]);
        }
    }
    await bulkInsert(db, "organisation_unit_group_member", ["group_id", "ou_id"], memberRows);

    await refreshMyProduitProgrammeNiveau();

    // After the refresh, so my_produitprogrammeniveau exists to be marked.
    const marked = await applyTombstones(db, config.deactivated);

    // After the tombstones, which say which rows are withdrawn. Every report is
    // re-judged, not only those whose lines moved: a withdrawn row is no longer owed.
    const reattached = await reattachWithdrawnLines(db);
    const reports = await db.select<{ id: string }[]>("SELECT id FROM rapportfs");
    for (const report of reports) {
        await refreshRapportFsStatus(report.id);
    }

    await setConfigVersion({
        version: config.version,
        schema: config.schema,
        publishedAt: config.published_at ?? null,
        checksum: config.checksum ?? null,
    });

    const withdrawn = marked ? `, ${marked} élément(s) retiré(s) et conservé(s) pour l'historique` : "";
    const moved = reattached.length
        ? ` Les lignes de ${reattached.length} rapport(s) saisies sur des produits fusionnés par le ` +
          "serveur ont été rattachées au produit qui les remplace."
        : "";
    return (
        `Configuration v${config.version} importée : ${config.organisation_units.length} unités ` +
        `d'organisation, ${config.produits.length} produits, ${config.programmes.length} programmes, ` +
        `${config.produit_programme_niveau.length} liaisons produit/programme/niveau, ` +
        `${config.categories.length} catégories${withdrawn}.${moved}`
    );
}
