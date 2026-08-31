import {invoke} from "@tauri-apps/api/core";
import {save} from "@tauri-apps/plugin-dialog";
import {writeFile} from "@tauri-apps/plugin-fs";
import {getDb} from "../../../services/db.ts";
import {stampReportWithConfigVersion} from "../../configuration/services/config-version-service.ts";
import {markRapportFsExported, setRapportFsExportedDate} from "./rapportfs-service.ts";
import {getMyOrganisationUnit} from "../../organisation-units/organisation-units-service.ts";
import {parseMoisAnnee} from "../../../utils/mois-annee.ts";

const UTGLFS_FILTERS = [{name: "Export UTGL FS", extensions: ["utglhp"]}];

// The names come from the server's configuration, so they can carry anything;
// what reaches the save dialog is a path, and these are the characters Windows
// refuses in one. Trailing dots and spaces go the same way.
const sanitiseNamePart = (part: string) =>
    part.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().replace(/\.+$/, "").trim();

// "07-2026", not formatMoisAnnee's "07/2026": this one ends up in a file name,
// where a slash is a path separator rather than a character.
function moisAnneeForFileName(moisAnnee: string | null): string | null {
    const parsed = parseMoisAnnee(moisAnnee);
    return parsed ? `${String(parsed.month).padStart(2, "0")}-${parsed.year}` : null;
}

/**
 * The file name proposed for an export:
 * "Rapport - <mois-année> - <district> - <FS>".
 *
 * A part that can't be read is left out rather than leaving an empty segment
 * behind, so a report with no month, or a device with no organisation unit
 * saved, still gets a usable name instead of "Rapport -  -  - ".
 */
export function buildExportFileName(
    moisAnnee?: string | null,
    sdspName?: string | null,
    fsName?: string | null,
): string {
    return ["Rapport", moisAnneeForFileName(moisAnnee ?? null), sdspName, fsName]
        .map((part) => (part ? sanitiseNamePart(part) : ""))
        .filter((part) => part.length > 0)
        .join(" - ");
}

interface MyProduitProgrammeNiveauRow {
    id: string;
    produit_id: string;
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
    // The configuration this report was filled in against. The server measures
    // completeness against this rather than against its current configuration,
    // so a report captured before a produit existed is not counted as missing it.
    config_version: number | null;
}

interface RapportfsLigneRow {
    id: string;
    rapportfs_id: string;
    produit_programme_niveau_id: string;
    qte_dispo_deb_mois: number | null;
    qte_rec_mois: number | null;
    qte_dist_patient: number | null;
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
    // How the produit was labelled here when the line was filled in. Travels with
    // the line so the server can store it verbatim, and so a line whose
    // configuration the server does not recognise can still be named in the
    // import report instead of being dropped without trace.
    produit_code: string;
    produit_name: string;
    produit_unit: string;
    programme_name: string;
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
        `SELECT id, name, created, exported_date, status, mois_annee, fs_id, edited_by, config_version
         FROM rapportfs
         WHERE id = $1`,
        [rapportfsId],
    );

    const ligneRows = await db.select<RapportfsLigneRow[]>(
        `SELECT id, rapportfs_id, produit_programme_niveau_id, qte_dispo_deb_mois, qte_rec_mois,
                qte_dist_patient, qte_perime_avarie_mois, qte_redepl_mois, nb_jour_rupture,
                stock_theorique, sdu_fin_mois, ecart, cmm, cmma, msd, situation, observation,
                produit_code, produit_name, produit_unit, programme_name
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

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// Prompts for a save location, then writes a .utglhp (Parquet-format) file
// containing this rapportfs's snapshot. Returns the destination path, or
// null if the user cancelled the save dialog.
//
// The Parquet bytes are built in Rust (see export_utglfs.rs) but the actual
// disk write happens here via @tauri-apps/plugin-fs's writeFile, not in Rust
// — on Android/iOS, the path the save dialog returns is a content:// SAF URI,
// not a real filesystem path, and plain std::fs can't write to that. The fs
// plugin knows how to handle both real paths and SAF URIs.
export async function exportRapportFsToUtglfs(rapportfsId: string): Promise<string | null> {
    const db = await getDb();
    const [rapport] = await db.select<{ mois_annee: string | null; exported_date: string | null }[]>(
        "SELECT mois_annee, exported_date FROM rapportfs WHERE id = $1",
        [rapportfsId],
    );
    const myOrganisationUnit = await getMyOrganisationUnit();
    const fileName = buildExportFileName(
        rapport?.mois_annee,
        myOrganisationUnit?.sdsp.name,
        myOrganisationUnit?.fs.name,
    );
    const dest = await save({
        title: "Exporter le rapport",
        defaultPath: `${fileName}.utglhp`,
        filters: UTGLFS_FILTERS,
    });
    if (!dest) return null;

    // Stamp the report with the configuration currently installed before the
    // payload is built: a configuration can arrive between a report being
    // started and being sent, and what the server needs is the version the
    // figures in the file were actually entered against.
    await stampReportWithConfigVersion(rapportfsId);
    // Same reason, and the same order matters just as much: buildExportPayload
    // reads exported_date straight out of the table, so stamping afterwards
    // shipped `exported_date: null` on every first export — the server then had
    // nothing to show under "Date d'export" and counted the report as never
    // prompt. Safe here because the save dialog has already been answered:
    // a cancelled export returned above without stamping anything.
    await markRapportFsExported(rapportfsId);
    try {
        const payload = await buildExportPayload(rapportfsId);
        const base64 = await invoke<string>("export_utglfs", {payload});
        await writeFile(dest, base64ToBytes(base64));
    } catch (err) {
        // Nothing reached the disk, so put the previous date back rather than
        // leaving a report claiming an export that never happened — the stamp is
        // what the list, and eventually the server's promptitude, both read.
        await setRapportFsExportedDate(rapportfsId, rapport?.exported_date ?? null);
        throw err;
    }
    return dest;
}
