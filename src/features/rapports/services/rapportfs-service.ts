import {getDb} from "../../../services/db.ts";
import {generateUuid} from "../../../services/id-service.ts";
import {formatMoisAnnee} from "../../../utils/date-format.ts";
import type {RapportHopitaux} from "../model/rapport-model.ts";
import {MANDATORY_LIGNE_FIELDS} from "../model/rapport-completeness.ts";

interface RapportfsRow {
    id: string;
    name: string;
    created: string;
    exported_date: string | null;
    status: number;
    mois_annee: string | null;
    fs_id: string;
    editor_id: string | null;
    editor_username: string | null;
    editor_poste: string | null;
    editor_phone: string | null;
    editor_device_id: string | null;
}

const EDITED_BY_SELECT = `
                r.id,
                r.name,
                r.created,
                r.exported_date,
                r.status,
                r.mois_annee,
                r.fs_id,
                eb.id         AS editor_id,
                eb.username   AS editor_username,
                eb.poste      AS editor_poste,
                eb.phone      AS editor_phone,
                eb.device_id  AS editor_device_id
         FROM rapportfs r
                  LEFT JOIN user_fs eb ON eb.id = r.edited_by`;

function toRapportFs(row: RapportfsRow): RapportHopitaux {
    return {
        id: row.id,
        name: row.name,
        sdsp_id: row.fs_id,
        mois_annee: row.mois_annee,
        created: row.created,
        status: Boolean(row.status),
        exported_date: row.exported_date,
        edited_by: row.editor_id
            ? {
                id: row.editor_id,
                username: row.editor_username!,
                poste: row.editor_poste!,
                phone: row.editor_phone!,
                deviceId: row.editor_device_id!,
            }
            : null,
        rapportfsLigne: [],
    };
}

export async function listRapportFs(): Promise<RapportHopitaux[]> {
    const db = await getDb();
    const rows = await db.select<RapportfsRow[]>(
        `SELECT ${EDITED_BY_SELECT}
         ORDER BY r.mois_annee DESC`,
    );
    return rows.map(toRapportFs);
}

// Used by the startup routing check: whether any rapportfs exists at all.
export async function hasAnyRapportFs(): Promise<boolean> {
    const db = await getDb();
    const rows = await db.select<unknown[]>("SELECT 1 FROM rapportfs LIMIT 1");
    return rows.length > 0;
}

export async function getRapportFsById(id: string): Promise<RapportHopitaux | null> {
    const db = await getDb();
    const rows = await db.select<RapportfsRow[]>(
        `SELECT ${EDITED_BY_SELECT}
         WHERE r.id = $1`,
        [id],
    );
    const row = rows[0];
    return row ? toRapportFs(row) : null;
}

export async function deleteRapportFs(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM rapportfs WHERE id = $1", [id]);
}

// Stamps exported_date once this rapportfs has actually been exported as a
// standalone file (see rapportfs-export-service.ts) — null means it never
// has been.
export async function markRapportFsExported(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE rapportfs SET exported_date = $1 WHERE id = $2", [new Date().toISOString(), id]);
}

export async function createRapportFs(input: { fsId: string; moisAnnee: string }): Promise<string> {
    const db = await getDb();
    const id = generateUuid();
    const name = `Rapport Hopitaux ${formatMoisAnnee(input.moisAnnee)}`;
    await db.execute(
        `INSERT INTO rapportfs (id, name, created, exported_date, status, mois_annee, fs_id, edited_by)
         VALUES ($1, $2, $3, NULL, 0, $4, $5, NULL)`,
        [id, name, new Date().toISOString(), input.moisAnnee, input.fsId],
    );
    // Vacuously "Complet" if the FS has no applicable produits at all yet.
    await refreshRapportFsStatus(id);
    return id;
}

// Recomputes rapportfs.status: true only if every produit applicable to the
// current FS (my_produitprogrammeniveau) has a rapportfs_ligne with all of
// MANDATORY_LIGNE_FIELDS filled in. Must be called whenever a line is
// created or edited so the list page's "Statut" stays accurate.
export async function refreshRapportFsStatus(rapportfsId: string): Promise<boolean> {
    const db = await getDb();
    const mandatoryColumns = MANDATORY_LIGNE_FIELDS.map((field) => `l.${field}`).join(", ");
    const rows = await db.select<Record<string, unknown>[]>(
        `SELECT l.id AS ligne_id, ${mandatoryColumns}
         FROM my_produitprogrammeniveau mppn
                  LEFT JOIN rapportfs_ligne l
                            ON l.produit_programme_niveau_id = mppn.id AND l.rapportfs_id = $1`,
        [rapportfsId],
    );
    const complete = rows.every(
        (row) => row.ligne_id !== null && MANDATORY_LIGNE_FIELDS.every((field) => row[field] !== null),
    );
    await db.execute("UPDATE rapportfs SET status = $1 WHERE id = $2", [complete ? 1 : 0, rapportfsId]);
    return complete;
}
