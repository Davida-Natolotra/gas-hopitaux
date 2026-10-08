import Database from "@tauri-apps/plugin-sql";
import {getDb} from "../../../services/db.ts";
import {refreshMyProduitProgrammeNiveau} from "../../organisation-units/organisation-units-service.ts";
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

    await setConfigVersion({
        version: config.version,
        schema: config.schema,
        publishedAt: config.published_at ?? null,
        checksum: config.checksum ?? null,
    });

    const withdrawn = marked ? `, ${marked} élément(s) retiré(s) et conservé(s) pour l'historique` : "";
    return (
        `Configuration v${config.version} importée : ${config.organisation_units.length} unités ` +
        `d'organisation, ${config.produits.length} produits, ${config.programmes.length} programmes, ` +
        `${config.produit_programme_niveau.length} liaisons produit/programme/niveau, ` +
        `${config.categories.length} catégories${withdrawn}.`
    );
}
