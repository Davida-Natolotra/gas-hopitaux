import {getDb} from "../../services/db.ts";
import type {MyOrganisationUnit, OrganisationUnit} from "./organisation-unit-model.ts";

// Levels: 1=pays, 2=DRSP/région, 3=SDSP/district, 4=commune, 5=FS. Level 6+
// (if present in a config export) is not used by this cascade, matching
// utgl-csb's own organisation-unit selector.
export async function listOrganisationUnits(): Promise<OrganisationUnit[]> {
    const db = await getDb();
    return db.select<OrganisationUnit[]>(
        `SELECT id, name, level, parent_id
         FROM organisation_units
         WHERE level BETWEEN 2 AND 5`,
    );
}

interface MyOrganisationUnitRow {
    drsp_id: string;
    drsp_name: string;
    drsp_level: number;
    drsp_parent_id: string | null;
    sdsp_id: string;
    sdsp_name: string;
    sdsp_level: number;
    sdsp_parent_id: string | null;
    commune_id: string | null;
    commune_name: string | null;
    commune_level: number | null;
    commune_parent_id: string | null;
    fs_id: string;
    fs_name: string;
    fs_level: number;
    fs_parent_id: string | null;
}

export async function getMyOrganisationUnit(): Promise<MyOrganisationUnit | null> {
    const db = await getDb();
    const rows = await db.select<MyOrganisationUnitRow[]>(
        `SELECT drsp.id    AS drsp_id, drsp.name AS drsp_name, drsp.level AS drsp_level, drsp.parent_id AS drsp_parent_id,
                sdsp.id    AS sdsp_id, sdsp.name AS sdsp_name, sdsp.level AS sdsp_level, sdsp.parent_id AS sdsp_parent_id,
                commune.id AS commune_id, commune.name AS commune_name, commune.level AS commune_level,
                commune.parent_id AS commune_parent_id,
                fs.id      AS fs_id, fs.name AS fs_name, fs.level AS fs_level, fs.parent_id AS fs_parent_id
         FROM my_organisation_unit m
                  JOIN organisation_units drsp ON drsp.id = m.drsp_id
                  JOIN organisation_units sdsp ON sdsp.id = m.sdsp_id
                  LEFT JOIN organisation_units commune ON commune.id = m.commune_id
                  JOIN organisation_units fs ON fs.id = m.fs_id
         WHERE m.id = 1`,
    );
    const row = rows[0];
    if (!row) return null;

    return {
        drsp: {id: row.drsp_id, name: row.drsp_name, level: row.drsp_level, parent_id: row.drsp_parent_id},
        sdsp: {id: row.sdsp_id, name: row.sdsp_name, level: row.sdsp_level, parent_id: row.sdsp_parent_id},
        commune: row.commune_id
            ? {id: row.commune_id, name: row.commune_name!, level: row.commune_level!, parent_id: row.commune_parent_id!}
            : null,
        fs: {id: row.fs_id, name: row.fs_name, level: row.fs_level, parent_id: row.fs_parent_id},
    };
}

export async function saveMyOrganisationUnit(input: {
    drspId: string;
    sdspId: string;
    communeId: string | null;
    fsId: string;
}): Promise<void> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO my_organisation_unit (id, drsp_id, sdsp_id, commune_id, fs_id)
         VALUES (1, $1, $2, $3, $4)
         ON CONFLICT(id) DO UPDATE SET drsp_id    = excluded.drsp_id,
                                        sdsp_id    = excluded.sdsp_id,
                                        commune_id = excluded.commune_id,
                                        fs_id      = excluded.fs_id`,
        [input.drspId, input.sdspId, input.communeId, input.fsId],
    );
}
