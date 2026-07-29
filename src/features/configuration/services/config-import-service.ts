import Database from "@tauri-apps/plugin-sql";
import {getDb} from "../../../services/db.ts";
import {refreshMyProduitProgrammeNiveau} from "../../organisation-units/organisation-units-service.ts";
import type {ConfigFile} from "../models/config-model.ts";

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

export async function importConfig(config: ConfigFile): Promise<string> {
    const db = await getDb();

    // organisation_units, produit, programme and produit_programme_niveau are
    // upserted (never deleted) because my_organisation_unit, rapportfs_ligne
    // and my_produitprogrammeniveau hold live foreign keys into them — sqlx
    // enables `PRAGMA foreign_keys` by default, so deleting a still-referenced
    // row would fail with SQLITE_CONSTRAINT_FOREIGNKEY. Ids are stable across
    // exports of the same server data, so upserting keeps existing references
    // valid while still picking up renamed/moved entries.
    //
    // organisation_unit_group / organisation_unit_group_member have no
    // dependents, so they're simply replaced wholesale.
    await db.execute("DELETE FROM organisation_unit_group_member");
    await db.execute("DELETE FROM organisation_unit_group");

    // Sorted by level so every parent row is upserted before its children —
    // organisation_units.parent_id is a self-referencing foreign key.
    const sortedOrganisationUnits = [...config.organisation_units].sort((a, b) => a.level - b.level);
    await bulkUpsert(
        db,
        "organisation_units",
        ["id", "name", "level", "parent_id"],
        sortedOrganisationUnits.map((o) => [o.id, o.name, o.level, o.parent_id]),
    );

    await bulkUpsert(
        db,
        "produit",
        ["id", "name", "unit", "code", "uuid_dhis2"],
        config.produits.map((p) => [p.id, p.name, p.unit, p.code, p.uuid_dhis2]),
    );

    await bulkUpsert(
        db,
        "programme",
        ["id", "name"],
        config.programmes.map((p) => [p.id, p.name]),
    );

    await bulkUpsert(
        db,
        "produit_programme_niveau",
        ["id", "produit_id", "programme_id", "org_group_id", "org_group_name", '"order"'],
        config.produit_programme_niveau.map((p) => [
            p.id,
            p.produit_id,
            p.programme_id,
            p.org_group_id,
            p.org_group_name,
            p.order,
        ]),
    );

    await bulkInsert(
        db,
        "organisation_unit_group",
        ["id", "name", "short_name"],
        config.organisation_unit_groups.map((g) => [g.id, g.name, g.short_name]),
    );

    const memberRows: [string, string][] = [];
    for (const group of config.organisation_unit_groups) {
        for (const ouId of group.organisation_units) {
            memberRows.push([group.id, ouId]);
        }
    }
    await bulkInsert(db, "organisation_unit_group_member", ["group_id", "ou_id"], memberRows);

    await refreshMyProduitProgrammeNiveau();

    return (
        `Importé : ${config.organisation_units.length} unités d'organisation, ` +
        `${config.produits.length} produits, ${config.programmes.length} programmes, ` +
        `${config.produit_programme_niveau.length} liaisons produit/programme/niveau, ` +
        `${config.organisation_unit_groups.length} groupes.`
    );
}
