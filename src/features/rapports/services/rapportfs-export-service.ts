import {invoke} from "@tauri-apps/api/core";
import {save} from "@tauri-apps/plugin-dialog";
import {writeFile} from "@tauri-apps/plugin-fs";
import {getDb} from "../../../services/db.ts";
import {stampReportWithConfigVersion} from "../../configuration/services/config-version-service.ts";
import {markRapportFsExported, setRapportFsExportedDate} from "./rapportfs-service.ts";
import {niveauLabel, ppnOwedBy} from "../../configuration/services/applicability.ts";
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
    /** The server id of that unit (configuration schema 6); null on a line filled in
     *  before, which the server matches by `produit_unit` instead. */
    produit_unit_id: string | null;
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

interface ReportOrganisationUnit {
    drsp_id: string | null;
    sdsp_id: string | null;
    sdsp_name: string | null;
    commune_id: string | null;
    fs_id: string;
    fs_name: string;
}

/**
 * The report's own facility and what it sits under — DRSP (level 2), SDSP (3) and
 * commune (4) — read up the organisation tree from rapportfs.fs_id.
 *
 * Not my_organisation_unit: that is whichever facility the device is set to now, and
 * a device moved to another hospital still holds the reports of the first. utgl-web
 * files a report under the district this row names, checks it against the region and
 * the hospital tab it is imported from, and refuses a file naming two facilities.
 */
async function getReportOrganisationUnit(rapportfsId: string): Promise<ReportOrganisationUnit> {
    const db = await getDb();
    const [row] = await db.select<(ReportOrganisationUnit & { fs_level: number | null })[]>(
        `WITH RECURSIVE chain (id, name, level, parent_id) AS (
             SELECT ou.id, ou.name, ou.level, ou.parent_id
             FROM rapportfs r
                      JOIN organisation_units ou ON ou.id = r.fs_id
             WHERE r.id = $1
             UNION ALL
             SELECT ou.id, ou.name, ou.level, ou.parent_id
             FROM organisation_units ou
                      JOIN chain ON ou.id = chain.parent_id
         )
         SELECT r.fs_id                                              AS fs_id,
                (SELECT name FROM chain WHERE id = r.fs_id)          AS fs_name,
                (SELECT level FROM chain WHERE id = r.fs_id)         AS fs_level,
                (SELECT id FROM chain WHERE level = 4 AND id <> r.fs_id) AS commune_id,
                (SELECT id FROM chain WHERE level = 3)               AS sdsp_id,
                (SELECT name FROM chain WHERE level = 3)             AS sdsp_name,
                (SELECT id FROM chain WHERE level = 2)               AS drsp_id
         FROM rapportfs r
         WHERE r.id = $1`,
        [rapportfsId],
    );
    if (!row || row.fs_level === null) {
        throw new Error("La formation sanitaire de ce rapport est absente de la configuration installée.");
    }
    if (!row.sdsp_id || !row.drsp_id) {
        throw new Error(`District ou région introuvable au-dessus de « ${row.fs_name} » dans la configuration installée.`);
    }
    return row;
}

// Raw table rows only (no joins/derived fields) — the export is meant to be
// a faithful snapshot of these tables for the companion utgl server, not the
// enriched view models the rest of the UI uses.
//
// Everything is the report's own: its facility (see getReportOrganisationUnit), the
// produits that facility owes, and only its lines on those. A line on a produit the
// facility does not owe — say an LRR produit on a hospital that is not an LRR, left
// behind when the device was moved between hospitals — is not part of its report, and
// sending it would have the server count a produit the facility never had to report.
async function buildExportPayload(rapportfsId: string, unit: ReportOrganisationUnit): Promise<UtglfsExportPayload> {
    const db = await getDb();

    const my_produitprogrammeniveau = await db.select<MyProduitProgrammeNiveauRow[]>(
        `SELECT ppn.id, ppn.produit_id, ppn.programme_id, ppn.org_group_id,
                ${niveauLabel("ppn", "$1")} AS org_group_name, ppn."order"
         FROM produit_programme_niveau ppn
         WHERE ${ppnOwedBy("ppn", "$1")}
           AND ppn.active = 1`,
        [unit.fs_id],
    );
    const my_organisation_unit: MyOrganisationUnitRow[] = [{
        id: 1,
        drsp_id: unit.drsp_id!,
        sdsp_id: unit.sdsp_id!,
        commune_id: unit.commune_id,
        fs_id: unit.fs_id,
    }];
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
                produit_code, produit_name, produit_unit, produit_unit_id, programme_name
         FROM rapportfs_ligne l
         WHERE l.rapportfs_id = $1
           AND EXISTS (SELECT 1
                       FROM produit_programme_niveau ppn
                       WHERE ppn.id = l.produit_programme_niveau_id
                         AND ${ppnOwedBy("ppn", "$2")})`,
        [rapportfsId, unit.fs_id],
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
    // Named, and filed on the server, after the report's own facility.
    const unit = await getReportOrganisationUnit(rapportfsId);
    const fileName = buildExportFileName(rapport?.mois_annee, unit.sdsp_name, unit.fs_name);
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
        const payload = await buildExportPayload(rapportfsId, unit);
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
