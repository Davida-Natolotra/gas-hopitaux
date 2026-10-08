// The shape of the server's utgl_config.json export
// (utglbackend/configuration/publishing.py).
//
// `version` is the server's ConfigurationVersion id: an integer that only ever
// increases, bumped when the reference data actually changes. Reports are
// stamped with the version they were filled in against, so completeness can be
// judged against the configuration the device actually had rather than against
// whatever the server holds today.
//
// `schema` describes the shape of the file, separately from its contents. A file
// written by a newer server is refused outright rather than half-imported, and so
// is one older than MIN_SCHEMA: its produits carry no categories, so this build
// could not tell which of them the device's facilities owe.

/** The newest payload shape this app understands. Bump only when the shape changes.
 *  5 — produits configured once per programme, for categories of facilities
 *  (CSB, HOPITAUX, CTTR, …) rather than per organisation unit group. (4, a
 *  facility-type variant, was never released.)
 *  6 — produits have several units, and `apps` says, per field app, which
 *  categories it serves and which unit it reports each produit_programme_niveau in.
 *  Additive: a schema 5 file still imports, every row in its produit's one unit and
 *  every roster by its category's name. */
export const SUPPORTED_SCHEMA = 6;

/** The oldest payload shape this app still imports. */
export const MIN_SCHEMA = 5;

/** The field apps a configuration is published to, by the code each one looks
 *  itself up by in `apps`. This app's own is THIS_APP (this-app.ts). */
export type FieldAppCode = "GAS-FS" | "GAS-District" | "GAS-PhaGDis" | "GAS-Hopitaux";

export interface ConfigOrganisationUnit {
    id: string;
    name: string;
    level: number;
    parent_id: string | null;
}

export interface ConfigOrganisationUnitGroup {
    id: string;
    name: string;
    short_name: string;
    organisation_units: string[];
}

/** A named set of facilities — CSB, HOPITAUX, CTTR, CR, CDT, … — shared by every
 *  programme. Not mutually exclusive: an FS can be in several. */
export interface ConfigCategory {
    id: string;
    name: string;
    organisation_units: string[];
}

export interface ConfigProgramme {
    id: string;
    name: string;
}

/** A unit a produit can be reported in — Comprimé, Flacon, Boîte de 100… */
export interface ConfigProduitUnit {
    id: string;
    name: string;
}

export interface ConfigProduit {
    // A UUID since schema 3. Was a sequence number, which was only unique within
    // one server database and so re-pointed device configuration on any re-seed.
    id: string;
    name: string;
    /** The reference unit: what an app reports the produit in when `apps` names no
     *  unit for it. */
    unit: string;
    /** Every unit of the produit (schema 6). */
    units?: ConfigProduitUnit[];
    code: string | null;
    uuid_dhis2: string | null;
}

/** A produit as collected for one programme. An FS owes it when it is a member of at
 *  least one of `category_ids` — see services/applicability.ts. */
export interface ConfigProduitProgrammeNiveau {
    id: string;
    produit_id: string;
    programme_id: string;
    category_ids: string[];
    order: number | null;
}

/** A field app as the Assignation set it up (schema 6): its roster is the members of
 *  `category_ids`, and it reports each configuration row of `ppn_units` in that unit
 *  (one of the row's produit's units) — any other in the produit's reference unit. */
export interface ConfigApp {
    code: FieldAppCode;
    name: string;
    category_ids: string[];
    ppn_units: { ppn_id: string; unit_id: string }[];
}

/** Something withdrawn from the configuration. The row is marked archived
 *  locally, never deleted — reports already captured against it must keep
 *  displaying it. */
export interface ConfigTombstone {
    type: "produit" | "programme" | "organisation_unit_group" | "produit_programme_niveau";
    id: string;
    archived_at: string | null;
}

export interface ConfigFile {
    schema: number;
    version: number;
    published_at?: string | null;
    checksum?: string;
    organisation_units: ConfigOrganisationUnit[];
    organisation_unit_groups: ConfigOrganisationUnitGroup[];
    categories: ConfigCategory[];
    programmes: ConfigProgramme[];
    produits: ConfigProduit[];
    produit_programme_niveau: ConfigProduitProgrammeNiveau[];
    /** Schema 6. */
    apps?: ConfigApp[];
    deactivated: ConfigTombstone[];
}

const REQUIRED_ARRAY_KEYS: (keyof ConfigFile)[] = [
    "organisation_units",
    "organisation_unit_groups",
    "categories",
    "programmes",
    "produits",
    "produit_programme_niveau",
    "deactivated",
];

export function parseConfigFile(content: string): ConfigFile {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error("Le fichier n'est pas un JSON valide.");
    }

    if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Le fichier de configuration est invalide.");
    }

    const record = parsed as Record<string, unknown>;

    // Refuse a shape this build does not know rather than importing part of it:
    // a half-applied configuration is worse than none, because the device would
    // go on collecting against it without anything looking wrong.
    const schema = record.schema;
    if (typeof schema !== "number") {
        throw new Error(
            "Ce fichier de configuration est trop ancien pour cette version de " +
            "l'application. Exportez-le à nouveau depuis le serveur.",
        );
    }
    if (schema < MIN_SCHEMA) {
        throw new Error(
            `Ce fichier de configuration (schéma ${schema}) est antérieur à cette version de ` +
            `l'application (schéma ${MIN_SCHEMA} à ${SUPPORTED_SCHEMA}). Exportez-le à nouveau ` +
            "depuis le serveur.",
        );
    }
    if (schema > SUPPORTED_SCHEMA) {
        throw new Error(
            `Ce fichier de configuration (schéma ${schema}) a été produit par un serveur ` +
            `plus récent que cette application (schéma ${SUPPORTED_SCHEMA}). Mettez à jour ` +
            "l'application avant de l'importer.",
        );
    }

    if (typeof record.version !== "number") {
        throw new Error("Le fichier de configuration ne porte pas de numéro de version.");
    }

    for (const key of REQUIRED_ARRAY_KEYS) {
        if (!Array.isArray(record[key])) {
            throw new Error(`Le fichier de configuration est invalide : clé "${key}" manquante.`);
        }
    }
    if (schema >= 6 && !Array.isArray(record.apps)) {
        throw new Error('Le fichier de configuration est invalide : clé "apps" manquante.');
    }

    return parsed as ConfigFile;
}
