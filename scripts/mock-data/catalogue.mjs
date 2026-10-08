// The reference data half of the mock dataset: the organisation-unit tree, the
// groups, the categories (CSB, HOPITAUX, CTTR, CR, CDT, …), the programmes, the
// produits and the produit/programme/niveau links that tie them together.
//
// None of it is written here. It is read from utgl-config-reference.json, a real
// server export (schema 5, version 15) trimmed to the organisation units the app
// can actually read: listOrganisationUnits() queries levels 2-5 and the cascade
// selects level 5, so the export's level-6 units were dropped along with their
// group and category memberships. Everything else — 8 groups, 9 categories, 8
// programmes, 214 produits and 215 produit_programme_niveau links (one per
// produit and programme) — is verbatim, ids included.
//
// That matters because produit_programme_niveau is what decides which lines a
// report has: an invented catalogue produces a report that cannot be compared
// against anything the server would send. Refreshing the file is a matter of
// re-exporting from the server and re-running the trim (see the header of
// scripts/seed-mock-data.mjs).
//
// What this module still decides is only what a config file does not carry: which
// FS this install is, who the user is, and which links to withdraw so the app's
// tombstone handling has something to chew on.

import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {appliesTo, indexConfiguration, niveauLabel} from "./applicability.mjs";
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

// The category whose members this build collects for. Kept in step with
// CATEGORY_HOPITAUX in src/features/configuration/services/applicability.ts.
export const ROSTER_CATEGORY = "HOPITAUX";

// The configuration shape this seeder writes and the app accepts.
export const CONFIG_SCHEMA = 5;

const USER_PROFILE = {
    username: "RAKOTOARISOA Hanta",
    poste: "Responsable de la pharmacie hospitalière",
    // Raw 10 digits, no formatting spaces — see src/utils/phone-format.ts.
    phone: "0341234567",
};

// How many of this FS's produits to withdraw from the configuration part-way
// through the series. The export's own `deactivated` list only names rows the
// server merged away (none of them in this FS's subset), so there would
// otherwise be nothing exercising the tombstone path on a report; which produits
// get picked is decided below by a stable rule rather than named here, so the
// choice survives a re-export.
const ARCHIVED_PRODUIT_COUNT = 2;

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
        "produit_programme_niveau"]) {
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
 */
export function buildCatalogue({seed, archiveMonth, configVersion, referenceConfig}) {
    const uuidFor = makeUuidFactory(seed);
    const config = referenceConfig ?? readReferenceConfig();

    const organisationUnits = config.organisation_units;
    const programmes = config.programmes;
    const produits = config.produits;
    const groups = config.organisation_unit_groups;
    const categories = config.categories;
    const ppn = config.produit_programme_niveau;
    const index = indexConfiguration(config);

    // ── The FS this device is ────────────────────────────────────────────────
    const matches = organisationUnits.filter((ou) => ou.name === MY_FS_NAME && ou.level === 5);
    if (matches.length === 0) {
        throw new Error(`FS introuvable dans la configuration de référence : ${MY_FS_NAME}`);
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
        throw new Error(`Chaîne DRSP/SDSP/commune incomplète au-dessus de ${MY_FS_NAME}.`);
    }

    const hopitaux = index.categoryNamed(ROSTER_CATEGORY);
    if (!hopitaux) {
        throw new Error(`Catégorie ${ROSTER_CATEGORY} absente de la configuration de référence.`);
    }
    if (!index.categoryMembers.get(hopitaux.id).has(myFs.id)) {
        // Without this the cascade would not offer the FS in the first place.
        throw new Error(`${MY_FS_NAME} n'appartient pas à la catégorie ${ROSTER_CATEGORY}.`);
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
    const myPpn = ppn
        .filter((row) => appliesTo(index, row, myFs.id))
        .map((row) => ({...row, niveau: niveauLabel(index, row, [myFs.id])}));
    if (myPpn.length === 0) {
        throw new Error(`Aucune liaison produit/programme/niveau pour ${MY_FS_NAME}.`);
    }

    const produitById = new Map(produits.map((produit) => [produit.id, produit]));
    const programmeById = new Map(programmes.map((programme) => [programme.id, programme]));
    for (const row of myPpn) {
        if (!produitById.has(row.produit_id)) throw new Error(`Produit inconnu : ${row.produit_id}`);
        if (!programmeById.has(row.programme_id)) throw new Error(`Programme inconnu : ${row.programme_id}`);
    }

    // ── Withdrawn from the configuration ─────────────────────────────────────
    // Produits the server has stopped collecting. They are tombstoned, not
    // removed: reports already captured against them have to keep displaying
    // them (see migration 0007 and config-import-service.ts). Picked by id order
    // so the same produits are withdrawn on every run with the same export.
    const archivedProduitIds = new Set(
        [...new Set(myPpn.map((row) => row.produit_id))].sort().slice(0, ARCHIVED_PRODUIT_COUNT),
    );
    const archivedAt = `${monthKey(archiveMonth)}-28T08:00:00Z`;
    const withdrawn = myPpn
        .filter((row) => archivedProduitIds.has(row.produit_id))
        .map((row) => ({type: "produit_programme_niveau", id: row.id, archived_at: archivedAt}));
    const archivedPpnIds = new Set(withdrawn.map((tombstone) => tombstone.id));
    // The export's own tombstones (rows the server merged away) travel too: the
    // app marks whatever it holds of them, which here is nothing — the same no-op
    // a freshly installed device performs.
    const deactivated = [...(config.deactivated ?? []), ...withdrawn];

    return {
        configVersion: configVersion ?? config.version,
        referenceVersion: config.version,
        organisationUnits,
        groups,
        categories,
        categoryIndex: index,
        programmes,
        produits,
        ppn,
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

/** The config file the server would publish for this catalogue (schema 5). */
export function toConfigFile(catalogue, publishedAt) {
    return {
        schema: CONFIG_SCHEMA,
        version: catalogue.configVersion,
        published_at: publishedAt,
        checksum: null,
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
        deactivated: catalogue.deactivated,
    };
}
