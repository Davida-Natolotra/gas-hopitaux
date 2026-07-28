import {getDb} from "../../services/db.ts";
import {formatMoisAnnee} from "../../utils/date-format.ts";
import type {RapportFs} from "./rapport-model.ts";

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
        `SELECT id, name, created, exported_date, status, mois_annee, fs_id, edited_by
         FROM rapportfs
         ORDER BY mois_annee DESC`,
    );
    return rows.map(toRapportFs);
}

export async function deleteRapportFs(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM rapportfs WHERE id = $1", [id]);
}

export async function createRapportFs(input: {fsId: string; moisAnnee: string}): Promise<string> {
    const db = await getDb();
    const id = crypto.randomUUID();
    const name = `Rapport FS ${formatMoisAnnee(input.moisAnnee)}`;
    await db.execute(
        `INSERT INTO rapportfs (id, name, created, exported_date, status, mois_annee, fs_id, edited_by)
         VALUES ($1, $2, $3, NULL, 0, $4, $5, NULL)`,
        [id, name, new Date().toISOString(), input.moisAnnee, input.fsId],
    );
    return id;
}
