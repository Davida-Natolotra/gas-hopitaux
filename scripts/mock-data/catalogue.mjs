// The reference data half of the mock dataset: the organisation-unit tree, the
// groups ("niveaux"), the programmes, the produits and the
// produit/programme/niveau links that tie them together.
//
// None of it is written here. It is read from utgl-config-reference.json, a real
// server export (schema 3, version 11) trimmed to the organisation units the app
// can actually read: listOrganisationUnits() queries levels 2-5 and the cascade
// selects level 5, so the export's 21,609 level-6 units were dropped along with
// their group memberships. Everything else — all 8 groups, 8 programmes, 214
// produits and 337 produit_programme_niveau links — is verbatim, ids included.
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

import {makeUuidFactory} from "./random.mjs";
import {monthKey} from "./months.mjs";

export const REFERENCE_CONFIG_PATH = join(
    dirname(fileURLToPath(import.meta.url)),
    "utgl-config-reference.json",
);

// The FS this install belongs to: a real facility, and a member of HOPITAUX and
// of nothing else. This app collects the hospital report and
// my_produitprogrammeniveau is derived from the FS's group membership, so the
// group is what decides the report has 72 lines rather than none.
const MY_FS_NAME = "CHRD2 Bongatsara";

// The group whose members this build collects for. Kept in step with
// HOPITAUX_GROUP_NAME in src/features/organisation-units/organisation-units-service.ts.
const HOPITAUX_GROUP_NAME = "HOPITAUX";

const USER_PROFILE = {
    username: "RAKOTOARISOA Hanta",
    poste: "Responsable de la pharmacie hospitalière",
    // Raw 10 digits, no formatting spaces — see src/utils/phone-format.ts.
    phone: "0341234567",
};

// How many of this FS's produits to withdraw from the configuration part-way
// through the series. The export's own `deactivated` list is empty, so there
// would otherwise be nothing exercising the tombstone path; which produits get
// picked is decided below by a stable rule rather than named here, so the
// choice survives a re-export.
const ARCHIVED_PRODUIT_COUNT = 2;

export function readReferenceConfig(path = REFERENCE_CONFIG_PATH) {
    let config;
    try {
        config = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        throw new Error(`Configuration de référence illisible (${path}) : ${error.message}`);
    }
    for (const key of ["organisation_units", "organisation_unit_groups", "programmes", "produits",
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
    const ppn = config.produit_programme_niveau;

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

    const hopitaux = groups.find((group) => group.name === HOPITAUX_GROUP_NAME);
    if (!hopitaux) {
        throw new Error(`Groupe ${HOPITAUX_GROUP_NAME} absent de la configuration de référence.`);
    }
    if (!hopitaux.organisation_units.includes(myFs.id)) {
        // Without this the report would come out empty, and the cascade would
        // not offer the FS in the first place.
        throw new Error(`${MY_FS_NAME} n'appartient pas au groupe ${HOPITAUX_GROUP_NAME}.`);
    }

    const myOrganisationUnit = {
        drsp_id: drsp.id,
        sdsp_id: sdsp.id,
        commune_id: commune.id,
        fs_id: myFs.id,
    };

    // ── The device's own subset ──────────────────────────────────────────────
    // Same rule as refreshMyProduitProgrammeNiveau(): the links whose org_group
    // the saved FS is a member of.
    const myGroupIds = new Set(
        groups.filter((group) => group.organisation_units.includes(myFs.id)).map((group) => group.id),
    );
    const myPpn = ppn.filter((row) => myGroupIds.has(row.org_group_id));
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
    const deactivated = myPpn
        .filter((row) => archivedProduitIds.has(row.produit_id))
        .map((row) => ({type: "produit_programme_niveau", id: row.id, archived_at: archivedAt}));
    const archivedPpnIds = new Set(deactivated.map((tombstone) => tombstone.id));

    return {
        configVersion: configVersion ?? config.version,
        referenceVersion: config.version,
        organisationUnits,
        groups,
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
        // The niveaux this FS reports at, for the run summary.
        myGroupNames: groups.filter((group) => myGroupIds.has(group.id)).map((group) => group.name),
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

/** The config file the server would publish for this catalogue (schema 3). */
export function toConfigFile(catalogue, publishedAt) {
    return {
        schema: 3,
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
            org_group_id: row.org_group_id,
            org_group_name: row.org_group_name,
            order: row.order,
        })),
        deactivated: catalogue.deactivated,
    };
}
