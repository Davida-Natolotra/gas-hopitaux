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
// written by a newer server is refused outright rather than half-imported.

/** The payload shape this app understands. Bump only when the shape changes. */
export const SUPPORTED_SCHEMA = 3;

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

export interface ConfigProgramme {
    id: string;
    name: string;
}

export interface ConfigProduit {
    // A UUID since schema 3. Was a sequence number, which was only unique within
    // one server database and so re-pointed device configuration on any re-seed.
    id: string;
    name: string;
    unit: string;
    code: string | null;
    uuid_dhis2: string | null;
}

export interface ConfigProduitProgrammeNiveau {
    id: string;
    produit_id: string;
    programme_id: string;
    org_group_id: string;
    org_group_name: string;
    order: number | null;
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
    programmes: ConfigProgramme[];
    produits: ConfigProduit[];
    produit_programme_niveau: ConfigProduitProgrammeNiveau[];
    deactivated: ConfigTombstone[];
}

const REQUIRED_ARRAY_KEYS: (keyof ConfigFile)[] = [
    "organisation_units",
    "organisation_unit_groups",
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

    return parsed as ConfigFile;
}
