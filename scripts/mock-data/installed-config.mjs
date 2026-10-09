// The configuration the app has installed, read back out of its database, for the
// seeders: what `npm run dev:mock` follows when the device already has one, so a
// mock session shows the produits, units and roster this install actually collects
// rather than the bundled reference's.
//
// The device does not keep the file it imported, only what importConfig() wrote from
// it, so the configuration is rebuilt from those tables in the shape
// utgl-config-reference.json has (configuration schema 6), with these differences:
//
//   * only what is still active travels: withdrawn rows are what tombstones are for,
//     and a mock dataset starts from no history to be withdrawn from;
//   * a produit's `units` are the ones the device knows — those its rows are reported
//     in — not every unit the server has for it;
//   * `apps` carries every app's roster (app_category) but only this app's units. An
//     install that imported a schema 5 file has no app_category; its roster is then
//     the category the app was built around, by name, as inAppRoster() reads it.
//
// The database is copied before it is opened, journal files included: the app may
// be running with uncheckpointed writes in rfs.db-wal, and nothing here may touch
// the real file.

import {DatabaseSync} from "node:sqlite";
import {copyFileSync, existsSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {CONFIG_SCHEMA, DEFAULT_ROSTER_CATEGORY, THIS_APP} from "./catalogue.mjs";

/**
 * The installed configuration and the hospital the device is set up for, or null
 * when `dbPath` holds no imported configuration (no database, or one that never got
 * past the import step).
 */
export function readInstalledConfig(dbPath) {
    if (!existsSync(dbPath)) return null;

    const workDir = mkdtempSync(join(tmpdir(), "utgl-installed-"));
    try {
        const copy = join(workDir, "rfs.db");
        for (const suffix of ["", "-wal"]) {
            if (existsSync(`${dbPath}${suffix}`)) copyFileSync(`${dbPath}${suffix}`, `${copy}${suffix}`);
        }
        const db = new DatabaseSync(copy);
        try {
            return readFrom(db);
        } finally {
            db.close();
        }
    } finally {
        rmSync(workDir, {recursive: true, force: true});
    }
}

function readFrom(db) {
    const all = (sql) => db.prepare(sql).all();
    const one = (sql) => db.prepare(sql).get();
    const hasTable = (name) => Boolean(one(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '${name}'`));

    if (!hasTable("config_version") || !hasTable("app_category")) return null;
    const installed = one("SELECT version, published_at, checksum FROM config_version WHERE id = 1");
    if (!installed) return null;

    const membersOf = (sql) => {
        const byOwner = new Map();
        for (const {owner, ou} of all(sql)) byOwner.set(owner, [...(byOwner.get(owner) ?? []), ou]);
        return byOwner;
    };
    const groupMembers = membersOf("SELECT group_id AS owner, ou_id AS ou FROM organisation_unit_group_member");
    const categoryMembers = membersOf("SELECT category_id AS owner, ou_id AS ou FROM category_member");

    const categories = all("SELECT id, name FROM category ORDER BY id").map((category) => ({
        ...category,
        organisation_units: (categoryMembers.get(category.id) ?? []).sort(),
    }));

    const ppnRows = all(
        `SELECT ppn.id, ppn.produit_id, ppn.programme_id, ppn."order" AS "order", ppn.report_unit, ppn.report_unit_id
         FROM produit_programme_niveau ppn
                  JOIN produit p ON p.id = ppn.produit_id
                  JOIN programme pr ON pr.id = ppn.programme_id
         WHERE ppn.active = 1 AND p.active = 1 AND pr.active = 1
         ORDER BY ppn.id`,
    );
    const categoriesOf = new Map();
    for (const {ppn_id, category_id} of all("SELECT ppn_id, category_id FROM produit_programme_niveau_category")) {
        categoriesOf.set(ppn_id, [...(categoriesOf.get(ppn_id) ?? []), category_id]);
    }

    // The units the device knows, by produit: those its rows are reported in.
    const produitRows = all("SELECT id, name, unit, code, uuid_dhis2 FROM produit WHERE active = 1 ORDER BY id");
    const referenceUnit = new Map(produitRows.map((produit) => [produit.id, produit.unit]));
    const unitsOf = new Map();
    const ppnUnits = [];
    for (const row of ppnRows) {
        if (!row.report_unit_id) continue;
        const units = unitsOf.get(row.produit_id) ?? new Map();
        units.set(row.report_unit_id, row.report_unit);
        unitsOf.set(row.produit_id, units);
        // A row reported in its produit's reference unit needs no Assignation entry;
        // any other is one.
        if (row.report_unit !== referenceUnit.get(row.produit_id)) {
            ppnUnits.push({ppn_id: row.id, unit_id: row.report_unit_id});
        }
    }

    const rosters = new Map();
    for (const {app, category_id} of all("SELECT app, category_id FROM app_category ORDER BY app, category_id")) {
        rosters.set(app, [...(rosters.get(app) ?? []), category_id]);
    }
    if (!rosters.has(THIS_APP)) {
        const fallback = categories.find((category) => category.name.toUpperCase() === DEFAULT_ROSTER_CATEGORY);
        rosters.set(THIS_APP, fallback ? [fallback.id] : []);
    }

    const config = {
        schema: CONFIG_SCHEMA,
        version: installed.version,
        published_at: installed.published_at,
        checksum: installed.checksum,
        organisation_units: all("SELECT id, name, level, parent_id FROM organisation_units ORDER BY level, id"),
        organisation_unit_groups: all("SELECT id, name, short_name FROM organisation_unit_group WHERE active = 1 ORDER BY id")
            .map((group) => ({...group, organisation_units: (groupMembers.get(group.id) ?? []).sort()})),
        categories,
        programmes: all("SELECT id, name FROM programme WHERE active = 1 ORDER BY id"),
        produits: produitRows.map((produit) => ({
            id: produit.id,
            name: produit.name,
            unit: produit.unit,
            units: [...(unitsOf.get(produit.id) ?? new Map())]
                .map(([id, name]) => ({id, name}))
                .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
            code: produit.code,
            uuid_dhis2: produit.uuid_dhis2,
        })),
        produit_programme_niveau: ppnRows.map((row) => ({
            id: row.id,
            produit_id: row.produit_id,
            programme_id: row.programme_id,
            category_ids: (categoriesOf.get(row.id) ?? []).sort(),
            order: row.order,
        })),
        apps: [...rosters].map(([code, categoryIds]) => ({
            code,
            name: code,
            category_ids: categoryIds,
            ppn_units: code === THIS_APP ? ppnUnits : [],
        })),
        deactivated: [],
    };

    const saved = hasTable("my_organisation_unit") ? one("SELECT fs_id FROM my_organisation_unit WHERE id = 1") : null;
    return {config, fsId: saved?.fs_id ?? null};
}
