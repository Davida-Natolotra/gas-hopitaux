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
    id: number;
    name: string;
    unit: string;
    code: string | null;
    uuid_dhis2: string | null;
}

export interface ConfigProduitProgrammeNiveau {
    id: string;
    produit_id: number;
    programme_id: string;
    org_group_id: string;
    org_group_name: string;
    order: number | null;
}

export interface ConfigFile {
    version?: string | number;
    exported_at?: string;
    organisation_units: ConfigOrganisationUnit[];
    organisation_unit_groups: ConfigOrganisationUnitGroup[];
    programmes: ConfigProgramme[];
    produits: ConfigProduit[];
    produit_programme_niveau: ConfigProduitProgrammeNiveau[];
}

const REQUIRED_ARRAY_KEYS: (keyof ConfigFile)[] = [
    "organisation_units",
    "organisation_unit_groups",
    "programmes",
    "produits",
    "produit_programme_niveau",
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

    for (const key of REQUIRED_ARRAY_KEYS) {
        const value = (parsed as Record<string, unknown>)[key];
        if (!Array.isArray(value)) {
            throw new Error(`Le fichier de configuration est invalide : clé "${key}" manquante.`);
        }
    }

    return parsed as ConfigFile;
}
