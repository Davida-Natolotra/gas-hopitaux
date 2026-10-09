// The reference data half of the mock dataset: the organisation-unit tree, the
// groups, the categories (CSB, HOPITAUX, CTTR, CR, CDT, …), the programmes, the
// produits and their units, the produit/programme/niveau links that tie them
// together, and the Assignation (`apps`: each field app's roster and units).
//
// None of it is written here. It is read from utgl-config-reference.json, a real
// server export (schema 6, version 17) trimmed to the organisation units the app
// can actually read: listOrganisationUnits() queries levels 2-5 and the cascade
// selects level 5, so the export's level-6 units were dropped along with their
// group and category memberships. Everything else — 8 groups, 11 categories, 8
// programmes, 206 produits (8 of them with two units), 207
// produit_programme_niveau links (one per produit and programme, since the server
// merged the same-named produit copies the old per-group configuration had left)
// and the 4 apps — is verbatim, ids included. Regenerate it with trim-config.mjs
// from a fresh utgl-web export (see the header of scripts/seed-mock-data.mjs).
//
// That matters because produit_programme_niveau is what decides which lines a
// report has: an invented catalogue produces a report that cannot be compared
// against anything the server would send. Refreshing the file is a matter of
// re-exporting from the server and re-running the trim (see the header of
// scripts/seed-mock-data.mjs).
//
// What this module still decides is only what a config file does not carry: which
// FS this install is, who the user is, which links to withdraw so the app's
// tombstone handling has something to chew on, and which rows GAS-Hopitaux reports
// in a unit of its own so the Assignation's unit path has something to chew on too.

import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {appliesTo, indexConfiguration, niveauLabel, reportedUnit} from "./applicability.mjs";
import {makeUuidFactory} from "./random.mjs";
import {monthKey} from "./months.mjs";

export const REFERENCE_CONFIG_PATH = join(
    dirname(fileURLToPath(import.meta.url)),
    "utgl-config-reference.json",
);

// The FS this install belongs to: a real facility, a member of the HOPITAUX
// category. my_produitprogrammeniveau is every produit configured for a category
// the FS belongs to, so those memberships are what decide the report's lines.
const MY_FS_NAME = "CHRD2 Bongatsara";

// This app's code in the configuration's `apps` (src/features/configuration/
// models/this-app.ts): its entry says which categories are its roster and which
// unit it reports each row in.
export const THIS_APP = "GAS-Hopitaux";

// The category this app was built around: its roster when a configuration names
// none (schema 5) — CATEGORY_HOPITAUX in src/features/configuration/services/
// applicability.ts.
export const DEFAULT_ROSTER_CATEGORY = "HOPITAUX";

// The configuration shape this seeder writes and the app accepts.
export const CONFIG_SCHEMA = 6;

const USER_PROFILE = {
    username: "RAKOTOARISOA Hanta",
    poste: "Responsable de la pharmacie hospitalière",
    // Raw 10 digits, no formatting spaces — see src/utils/phone-format.ts.
    phone: "0341234567",
};

// With `synthetic` (the seeder's --simulate): how many of this FS's produits to
// withdraw from the configuration part-way through the series. The export's own
// `deactivated` list only names rows the server merged away (none of them in this
// FS's subset), so there would otherwise be nothing exercising the tombstone path
// on a report; which produits get picked is decided below by a stable rule rather
// than named here, so the choice survives a re-export.
//
// Never by default: these withdrawals are invented, and a dataset that claims the
// export's version while withdrawing produits the server still publishes shows
// them "Retiré" when utgl-web says nothing of the kind.
const ARCHIVED_PRODUIT_COUNT = 2;

// With `synthetic`, likewise: how many of this FS's rows to report in a unit other
// than their produit's reference unit. The export's Assignation names no unit for GAS-Hopitaux, so
// every row would otherwise be reported in its reference unit and the
// report_unit_id path would only ever carry the obvious id. Rows are picked among
// those whose produit has a second unit, by id order, like the archived ones.
const ASSIGNED_UNIT_COUNT = 2;

export function readReferenceConfig(path = REFERENCE_CONFIG_PATH) {
    let config;
    try {
        config = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        throw new Error(`Configuration de référence illisible (${path}) : ${error.message}`);
    }
    if (config.schema !== CONFIG_SCHEMA) {
        throw new Error(
            `Configuration de référence au schéma ${config.schema}, ${CONFIG_SCHEMA} attendu : ` +
            "ré-exportez-la depuis utgl-web.",
        );
    }
    for (const key of ["organisation_units", "organisation_unit_groups", "categories", "programmes", "produits",
        "produit_programme_niveau", "apps"]) {
        if (!Array.isArray(config[key]) || config[key].length === 0) {
            throw new Error(`Configuration de référence invalide : "${key}" manquante ou vide.`);
        }
    }
    return config;
}

/**
 * Builds the reference half of the dataset.
 *
 * `archiveMonth` is the month whose configuration withdrew this FS's archived
 * produits: they stay in the tables marked archived rather than being deleted,
 * which is what the app's tombstone handling expects.
 *
 * `configVersion` overrides the version the export carries — reports are stamped
 * with it, so a run can pretend to be on a newer configuration than the file.
 *
 * `referenceConfig` replaces the bundled reference (installed-config.mjs reads one
 * back out of the app's database), and `myFsId` the hospital it is for. The
 * configuration is used exactly as given — what importing it would install — unless
 * `synthetic` asks for produits withdrawn part-way and units assigned on top of it,
 * changes the server never published, to exercise those paths.
 */
export function buildCatalogue({seed, archiveMonth, configVersion, referenceConfig, myFsId = null, synthetic = false}) {
    const uuidFor = makeUuidFactory(seed);
    const config = referenceConfig ?? readReferenceConfig();

    const organisationUnits = config.organisation_units;
    const programmes = config.programmes;
    const produits = config.produits;
    const groups = config.organisation_unit_groups;
    const categories = config.categories;
    const ppn = config.produit_programme_niveau;
    const index = indexConfiguration(config);
    // The roster is what the Assignation gives this app — not a category picked by
    // name, which is only the app's fallback for a schema 5 file.
    const ownApp = config.apps.find((app) => app.code === THIS_APP);
    if (!ownApp) throw new Error(`Application ${THIS_APP} absente de "apps" dans la configuration.`);
    const rosterCategories = ownApp.category_ids.map((id) => index.categoryById.get(id)).filter(Boolean);
    if (rosterCategories.length === 0) throw new Error(`Aucune catégorie assignée à ${THIS_APP}.`);

    // ── The FS this device is ────────────────────────────────────────────────
    const matches = myFsId
        ? organisationUnits.filter((ou) => ou.id === myFsId)
        : organisationUnits.filter((ou) => ou.name === MY_FS_NAME && ou.level === 5);
    if (matches.length === 0) {
        throw new Error(`FS introuvable dans la configuration : ${myFsId ?? MY_FS_NAME}`);
    }
    if (matches.length > 1) {
        // Facility names repeat across districts in the real export; a name that
        // is no longer unique would silently pick a different hospital.
        throw new Error(`Plusieurs FS portent le nom « ${MY_FS_NAME} » : choisissez-en un autre.`);
    }
    const myFs = matches[0];

    const byId = new Map(organisationUnits.map((ou) => [ou.id, ou]));
    const parentOf = (ou) => (ou?.parent_id ? byId.get(ou.parent_id) : null);
    const commune = parentOf(myFs);
    const sdsp = parentOf(commune);
    const drsp = parentOf(sdsp);
    if (!commune || !sdsp || !drsp) {
        throw new Error(`Chaîne DRSP/SDSP/commune incomplète au-dessus de ${myFs.name}.`);
    }

    if (!rosterCategories.some((category) => index.categoryMembers.get(category.id).has(myFs.id))) {
        // Without this the cascade would not offer the FS in the first place.
        throw new Error(
            `${myFs.name} n'est membre d'aucune catégorie de ${THIS_APP} ` +
            `(${rosterCategories.map((category) => category.name).join(", ")}) dans la configuration.`,
        );
    }

    const myOrganisationUnit = {
        drsp_id: drsp.id,
        sdsp_id: sdsp.id,
        commune_id: commune.id,
        fs_id: myFs.id,
    };

    // ── The device's own subset ──────────────────────────────────────────────
    // Same rule as refreshMyProduitProgrammeNiveau(): the links configured for a
    // category the saved FS is a member of, each labelled with the categories it
    // reaches the FS through.
    const myPpnRows = ppn.filter((row) => appliesTo(index, row, myFs.id));
    if (myPpnRows.length === 0) {
        throw new Error(`Aucune liaison produit/programme/niveau pour ${myFs.name}.`);
    }

    const produitById = new Map(produits.map((produit) => [produit.id, produit]));
    const programmeById = new Map(programmes.map((programme) => [programme.id, programme]));
    for (const row of myPpnRows) {
        if (!produitById.has(row.produit_id)) throw new Error(`Produit inconnu : ${row.produit_id}`);
        if (!programmeById.has(row.programme_id)) throw new Error(`Programme inconnu : ${row.programme_id}`);
    }

    // ── Withdrawn from the configuration ─────────────────────────────────────
    // Produits the server has stopped collecting. They are tombstoned, not
    // removed: reports already captured against them have to keep displaying
    // them (see migration 0007 and config-import-service.ts). Picked by id order
    // so the same produits are withdrawn on every run with the same export.
    const archivedProduitIds = new Set(
        [...new Set(myPpnRows.map((row) => row.produit_id))].sort().slice(0, synthetic ? ARCHIVED_PRODUIT_COUNT : 0),
    );
    const archivedAt = `${monthKey(archiveMonth)}-28T08:00:00Z`;
    const withdrawn = myPpnRows
        .filter((row) => archivedProduitIds.has(row.produit_id))
        .map((row) => ({type: "produit_programme_niveau", id: row.id, archived_at: archivedAt}));
    const archivedPpnIds = new Set(withdrawn.map((tombstone) => tombstone.id));
    // The export's own tombstones (rows the server merged away) travel too: the
    // app marks whatever it holds of them, which here is nothing — the same no-op
    // a freshly installed device performs.
    const deactivated = [...(config.deactivated ?? []), ...withdrawn];

    // ── The units this app reports in ────────────────────────────────────────
    // The Assignation as exported, plus a unit of GAS-Hopitaux's own for a couple
    // of this FS's still-collected rows whose produit has a second unit (see
    // ASSIGNED_UNIT_COUNT). Every row then carries the unit the import would give
    // it: the assigned one, else its produit's reference unit.
    const assigned = new Map(ownApp.ppn_units.map((row) => [row.ppn_id, row.unit_id]));
    const assignedHere = myPpnRows
        .filter((row) => !archivedPpnIds.has(row.id) && !assigned.has(row.id))
        .filter((row) => (produitById.get(row.produit_id).units ?? []).length > 1)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, synthetic ? ASSIGNED_UNIT_COUNT : 0)
        .map((row) => {
            const produit = produitById.get(row.produit_id);
            const other = produit.units.find((unit) => unit.name !== produit.unit);
            return {ppn_id: row.id, unit_id: other.id};
        });
    for (const row of assignedHere) assigned.set(row.ppn_id, row.unit_id);
    const apps = config.apps.map((app) => (app.code === THIS_APP
        ? {...app, ppn_units: [...app.ppn_units, ...assignedHere].sort((a, b) => a.ppn_id.localeCompare(b.ppn_id))}
        : app));
    const withUnit = (row) => {
        const unit = reportedUnit(produitById.get(row.produit_id), assigned.get(row.id));
        return {...row, report_unit: unit.name, report_unit_id: unit.id};
    };
    const ppnWithUnits = ppn.map(withUnit);
    const myPpn = myPpnRows.map((row) => ({...withUnit(row), niveau: niveauLabel(index, row, [myFs.id])}));

    return {
        configVersion: configVersion ?? config.version,
        // The export's own stamp, unless the dataset no longer is that export.
        publishedAt: config.published_at ?? null,
        checksum: synthetic || configVersion != null ? null : (config.checksum ?? null),
        referenceVersion: config.version,
        organisationUnits,
        groups,
        categories,
        categoryIndex: index,
        apps,
        // The categories THIS_APP serves, for the run summary.
        rosterCategoryNames: rosterCategories.map((category) => category.name).sort(),
        assignedPpnIds: new Set(assignedHere.map((row) => row.ppn_id)),
        programmes,
        produits,
        ppn: ppnWithUnits,
        myPpn,
        deactivated,
        archivedPpnIds,
        archivedAt,
        archiveMonth,
        myOrganisationUnit,
        myFs,
        drsp,
        sdsp,
        commune,
        // The categories this FS reports as, for the run summary.
        myCategoryNames: categories
            .filter((category) => category.organisation_units.includes(myFs.id))
            .map((category) => category.name)
            .sort(),
        device: {device_id: uuidFor("device")},
        user: {
            id: uuidFor("user"),
            ...USER_PROFILE,
            device_id: uuidFor("device"),
        },
        // Lookup tables the report generator and the verifier both want.
        produitById,
        programmeById,
    };
}

/** The config file the server would publish for this catalogue (schema 6). */
export function toConfigFile(catalogue, publishedAt) {
    return {
        schema: CONFIG_SCHEMA,
        version: catalogue.configVersion,
        published_at: catalogue.publishedAt ?? publishedAt,
        checksum: catalogue.checksum,
        organisation_units: catalogue.organisationUnits.map((ou) => ({
            id: ou.id, name: ou.name, level: ou.level, parent_id: ou.parent_id,
        })),
        organisation_unit_groups: catalogue.groups.map((group) => ({
            id: group.id,
            name: group.name,
            short_name: group.short_name,
            organisation_units: group.organisation_units,
        })),
        categories: catalogue.categories.map((category) => ({
            id: category.id,
            name: category.name,
            organisation_units: category.organisation_units,
        })),
        programmes: catalogue.programmes.map((programme) => ({id: programme.id, name: programme.name})),
        produits: catalogue.produits.map((produit) => ({
            id: produit.id,
            name: produit.name,
            unit: produit.unit,
            units: produit.units ?? [],
            code: produit.code,
            uuid_dhis2: produit.uuid_dhis2,
        })),
        produit_programme_niveau: catalogue.ppn.map((row) => ({
            id: row.id,
            produit_id: row.produit_id,
            programme_id: row.programme_id,
            category_ids: row.category_ids,
            order: row.order,
        })),
        apps: catalogue.apps.map((app) => ({
            code: app.code,
            name: app.name,
            category_ids: app.category_ids,
            ppn_units: app.ppn_units,
        })),
        deactivated: catalogue.deactivated,
    };
}
