import {getDb} from "../../../services/db.ts";
import {formatMoisAnnee} from "../../../utils/date-format.ts";
import type {RapportFs} from "../model/rapport-model.ts";
import {MANDATORY_LIGNE_FIELDS} from "../model/rapport-completeness.ts";

interface RapportfsRow {
    id: string;
    name: string;
    created: string;
    exported_date: string | null;
    status: number;
    mois_annee: string | null;
    fs_id: string;
    edited_by: string | null;
}

function toRapportFs(row: RapportfsRow): RapportFs {
    return {
        id: row.id,
        name: row.name,
        fs_id: row.fs_id,
        mois_annee: row.mois_annee,
        created: row.created,
        status: Boolean(row.status),
        exported_date: row.exported_date,
        edited_by: row.edited_by,
        rapportfsLigne: [],
    };
}

export async function listRapportFs(): Promise<RapportFs[]> {
    const db = await getDb();
    const rows = await db.select<RapportfsRow[]>(
        `SELECT id,
                name,
                created,
                exported_date,
                status,
                mois_annee,
                fs_id,
                edited_by
         FROM rapportfs
         ORDER BY mois_annee DESC`,
    );
    return rows.map(toRapportFs);
}

export async function getRapportFsById(id: string): Promise<RapportFs | null> {
    const db = await getDb();
    const rows = await db.select<RapportfsRow[]>(
        `SELECT id,
                name,
                created,
                exported_date,
                status,
                mois_annee,
                fs_id,
                edited_by
         FROM rapportfs
         WHERE id = $1`,
        [id],
    );
    const row = rows[0];
    return row ? toRapportFs(row) : null;
}

export async function deleteRapportFs(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM rapportfs WHERE id = $1", [id]);
}

export async function createRapportFs(input: { fsId: string; moisAnnee: string }): Promise<string> {
    const db = await getDb();
    const id = crypto.randomUUID();
    const name = `Rapport FS ${formatMoisAnnee(input.moisAnnee)}`;
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
