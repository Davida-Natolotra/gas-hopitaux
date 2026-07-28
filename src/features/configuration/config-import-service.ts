import Database from "@tauri-apps/plugin-sql";
import {getDb} from "../../services/db.ts";
import type {ConfigFile} from "./config-model.ts";

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
        await db.execute(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`, values);
    }
}

export async function importConfig(config: ConfigFile): Promise<string> {
    const db = await getDb();

    // Replace all reference data, children first to respect foreign keys.
    await db.execute("DELETE FROM organisation_unit_group_member");
    await db.execute("DELETE FROM organisation_unit_group");
    await db.execute("DELETE FROM produit_programme_niveau");
    await db.execute("DELETE FROM programme");
    await db.execute("DELETE FROM produit");
    await db.execute("DELETE FROM organisation_units");

    await bulkInsert(
        db,
        "organisation_units",
        ["id", "name", "level", "parent_id"],
        config.organisation_units.map((o) => [o.id, o.name, o.level, o.parent_id]),
    );

    await bulkInsert(
        db,
        "produit",
        ["id", "name", "unit", "code", "uuid_dhis2"],
        config.produits.map((p) => [p.id, p.name, p.unit, p.code, p.uuid_dhis2]),
    );

    await bulkInsert(
        db,
        "programme",
        ["id", "name"],
        config.programmes.map((p) => [p.id, p.name]),
    );

    await bulkInsert(
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

    return (
        `Importé : ${config.organisation_units.length} unités d'organisation, ` +
        `${config.produits.length} produits, ${config.programmes.length} programmes, ` +
        `${config.produit_programme_niveau.length} liaisons produit/programme/niveau, ` +
        `${config.organisation_unit_groups.length} groupes.`
    );
}
