import {invoke} from "@tauri-apps/api/core";
import {save} from "@tauri-apps/plugin-dialog";
import {getDb} from "../../../services/db.ts";

const UTGLFS_FILTERS = [{name: "Export UTGL FS", extensions: ["utglfs"]}];

interface MyProduitProgrammeNiveauRow {
    id: string;
    produit_id: number;
    programme_id: string;
    org_group_id: string;
    org_group_name: string;
    order: number | null;
}

interface MyOrganisationUnitRow {
    id: number;
    drsp_id: string;
    sdsp_id: string;
    commune_id: string | null;
    fs_id: string;
}

interface UserFsRow {
    id: string;
    username: string;
    poste: string;
    phone: string;
    device_id: string;
}

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

interface RapportfsLigneRow {
    id: string;
    rapportfs_id: string;
    produit_programme_niveau_id: string;
    qte_dispo_deb_mois: number | null;
    qte_rec_mois: number | null;
    qte_dist_patient: number | null;
    qte_dist_ac: number | null;
    qte_perime_avarie_mois: number | null;
    qte_redepl_mois: number | null;
    nb_jour_rupture: number | null;
    stock_theorique: number | null;
    sdu_fin_mois: number | null;
    ecart: number | null;
    cmm: number | null;
    cmma: number | null;
    msd: number;
    situation: string;
    observation: string;
}

interface DetailSduRow {
    id: string;
    sdu: number;
    date_peremption: string | null;
}

interface UtglfsExportPayload {
    my_produitprogrammeniveau: MyProduitProgrammeNiveauRow[];
    my_organisation_unit: MyOrganisationUnitRow[];
    user_fs: UserFsRow[];
    rapportfs: RapportfsRow[];
    rapportfs_ligne: (RapportfsLigneRow & {detail_sdu: DetailSduRow[]})[];
}

// Raw table rows only (no joins/derived fields) — the export is meant to be
// a faithful snapshot of these tables for the companion utgl server, not the
// enriched view models the rest of the UI uses.
async function buildExportPayload(rapportfsId: string): Promise<UtglfsExportPayload> {
    const db = await getDb();

    const my_produitprogrammeniveau = await db.select<MyProduitProgrammeNiveauRow[]>(
        `SELECT id, produit_id, programme_id, org_group_id, org_group_name, "order"
         FROM my_produitprogrammeniveau`,
    );
    const my_organisation_unit = await db.select<MyOrganisationUnitRow[]>(
        `SELECT id, drsp_id, sdsp_id, commune_id, fs_id FROM my_organisation_unit`,
    );
    const user_fs = await db.select<UserFsRow[]>(
        `SELECT id, username, poste, phone, device_id FROM user_fs`,
    );
    const rapportfs = await db.select<RapportfsRow[]>(
        `SELECT id, name, created, exported_date, status, mois_annee, fs_id, edited_by
         FROM rapportfs
         WHERE id = $1`,
        [rapportfsId],
    );

    const ligneRows = await db.select<RapportfsLigneRow[]>(
        `SELECT id, rapportfs_id, produit_programme_niveau_id, qte_dispo_deb_mois, qte_rec_mois,
                qte_dist_patient, qte_dist_ac, qte_perime_avarie_mois, qte_redepl_mois, nb_jour_rupture,
                stock_theorique, sdu_fin_mois, ecart, cmm, cmma, msd, situation, observation
         FROM rapportfs_ligne
         WHERE rapportfs_id = $1`,
        [rapportfsId],
    );
    const rapportfs_ligne: (RapportfsLigneRow & {detail_sdu: DetailSduRow[]})[] = [];
    for (const ligne of ligneRows) {
        const detail_sdu = await db.select<DetailSduRow[]>(
            `SELECT id, sdu, date_peremption FROM detail_sdu WHERE rapportfs_ligne_id = $1`,
            [ligne.id],
        );
        rapportfs_ligne.push({...ligne, detail_sdu});
    }

    return {my_produitprogrammeniveau, my_organisation_unit, user_fs, rapportfs, rapportfs_ligne};
}

// Prompts for a save location, then writes a .utglfs (Parquet-format) file
// containing this rapportfs's snapshot. Returns the destination path, or
// null if the user cancelled the save dialog.
export async function exportRapportFsToUtglfs(rapportfsId: string, suggestedName: string): Promise<string | null> {
    const dest = await save({
        title: "Exporter le rapport",
        defaultPath: `${suggestedName}.utglfs`,
        filters: UTGLFS_FILTERS,
    });
    if (!dest) return null;

    const payload = await buildExportPayload(rapportfsId);
    await invoke("export_utglfs", {dest, payload});
    return dest;
}
