import {getDb} from "../../../services/db.ts";
import {generateUuid} from "../../../services/id-service.ts";
import type {DetailSDU, RapportHopitauxLigne} from "../model/rapport-model.ts";
import {monthKey, parseMoisAnnee, shiftMonths} from "../../../utils/mois-annee.ts";
import {ppnOwedBy} from "../../configuration/services/applicability.ts";

export interface RapportViewRow {
    ppnId: string;
    produitName: string;
    unit: string;
    ligneId: string | null;
    ligne: RapportHopitauxLigne | null;
    // sdu_fin_mois of the same produit from the previous consecutive month's
    // rapportfs (same fs_id), when one exists. Used to default the new
    // month's qte_dispo_deb_mois when this produit hasn't been reported yet.
    previousSduFinMois: number | null;
    // Withdrawn from the configuration this device has installed. Only rows this
    // report has already captured can be in this state (see getProgrammeSections),
    // and they are marked so they are not mistaken for something still collected.
    archived: boolean;
}

export interface ProgrammeSection {
    programmeId: string;
    programmeName: string;
    rows: RapportViewRow[];
}

interface RapportViewQueryRow {
    ppn_id: string;
    produit_name: string;
    produit_unit: string;
    programme_id: string;
    programme_name: string;
    produit_actif: number;
    ligne_id: string | null;
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
    msd: number | null;
    situation: string | null;
    observation: string | null;
    prev_sdu_fin_mois: number | null;
}

function toLigne(row: RapportViewQueryRow): RapportHopitauxLigne | null {
    if (!row.ligne_id) return null;
    return {
        produit_programme_niveau_id: row.ppn_id,
        qte_dispo_deb_mois: row.qte_dispo_deb_mois,
        qte_rec_mois: row.qte_rec_mois,
        qte_dist_patient: row.qte_dist_patient,
        qte_perime_avarie_mois: row.qte_perime_avarie_mois,
        qte_redepl_mois: row.qte_redepl_mois,
        nb_jour_rupture: row.nb_jour_rupture,
        stock_theorique: row.stock_theorique,
        sdu_fin_mois: row.sdu_fin_mois,
        ecart: row.ecart,
        cmm: row.cmm,
        cmma: row.cmma,
        msd: row.msd ?? 0,
        situation: row.situation ?? "",
        observation: row.observation ?? "",
        detail_sdu: null,
    };
}

// Finds the rapportfs (same fs_id) whose mois_annee is exactly one month
// before the given rapportfs's, if any.
async function findPreviousConsecutiveRapportfsId(rapportfsId: string): Promise<string | null> {
    const db = await getDb();
    const current = await db.select<{ mois_annee: string | null; fs_id: string }[]>(
        `SELECT mois_annee, fs_id
         FROM rapportfs
         WHERE id = $1`,
        [rapportfsId],
    );
    const ym = parseMoisAnnee(current[0]?.mois_annee ?? null);
    if (!ym) return null;
    const previousKey = monthKey(shiftMonths(ym, -1));

    const candidates = await db.select<{ id: string; mois_annee: string | null }[]>(
        `SELECT id, mois_annee
         FROM rapportfs
         WHERE fs_id = $1
           AND id != $2`,
        [current[0].fs_id, rapportfsId],
    );
    const match = candidates.find((c) => {
        const cym = parseMoisAnnee(c.mois_annee);
        return cym !== null && monthKey(cym) === previousKey;
    });
    return match?.id ?? null;
}

// Loops over the produits the report's own facility owes (ppnOwedBy against
// rapportfs.fs_id — its categories, never those of whichever facility the device
// is set to now) and left-joins this report's own rapportfs_ligne rows, so a
// produit with no entry yet still shows up as an "Incomplet" row. A line on a
// produit that facility does not owe is not shown: it is not part of its report. Also left-joins the previous consecutive
// month's rapportfs_ligne (if any) to carry over sdu_fin_mois as the
// suggested qte_dispo_deb_mois for produits not yet reported this month.
// Archived produits. A produit withdrawn from the configuration must stop being
// offered for new collection without disappearing from what has already been
// collected — a report has to stay readable exactly as it was filled in. Two
// cases are therefore kept, and only those:
//
//   * the produit is still active in the installed configuration;
//   * this report already has a line for it, whatever its state now.
//
// What decides this is the configuration the device holds, not the report's
// month. Once a version arrives that withdraws a produit, it is gone from every
// report that has not already captured it — including a report opened now for
// an earlier month, which is new collection like any other. Reports that did
// capture it keep their line untouched and simply carry the "Retiré" mark, so
// `archived` here is the plain configuration flag.
//
// The labels come from the line where there is one, and from the configuration
// only for rows not yet filled in. Reading them from the join instead would let
// a later rename silently rewrite what a finished report appears to say.
export async function getProgrammeSections(rapportfsId: string): Promise<ProgrammeSection[]> {
    const db = await getDb();
    const previousRapportfsId = await findPreviousConsecutiveRapportfsId(rapportfsId);
    const rows = await db.select<RapportViewQueryRow[]>(
        `SELECT ppn.id                         AS ppn_id,
                COALESCE(NULLIF(l.produit_name, ''), p.name)    AS produit_name,
                COALESCE(NULLIF(l.produit_unit, ''), ppn.report_unit, p.unit)    AS produit_unit,
                pr.id                          AS programme_id,
                COALESCE(NULLIF(l.programme_name, ''), pr.name) AS programme_name,
                ppn.active                     AS produit_actif,
                l.id                           AS ligne_id,
                l.qte_dispo_deb_mois,
                l.qte_rec_mois,
                l.qte_dist_patient,
                l.qte_perime_avarie_mois,
                l.qte_redepl_mois,
                l.nb_jour_rupture,
                l.stock_theorique,
                l.sdu_fin_mois,
                l.ecart,
                l.cmm,
                l.cmma,
                l.msd,
                l.situation,
                l.observation,
                prev_l.sdu_fin_mois            AS prev_sdu_fin_mois
         FROM rapportfs r
                  JOIN produit_programme_niveau ppn ON ${ppnOwedBy("ppn", "r.fs_id")}
                  JOIN produit p ON p.id = ppn.produit_id
                  JOIN programme pr ON pr.id = ppn.programme_id
                  LEFT JOIN rapportfs_ligne l
                            ON l.produit_programme_niveau_id = ppn.id AND l.rapportfs_id = r.id
                  LEFT JOIN rapportfs_ligne prev_l
                            ON prev_l.produit_programme_niveau_id = ppn.id AND prev_l.rapportfs_id = $2
         WHERE r.id = $1
           AND (ppn.active = 1 OR l.id IS NOT NULL)
         ORDER BY pr.name, (ppn."order" IS NULL), ppn."order", p.name`,
        [rapportfsId, previousRapportfsId ?? ""],
    );

    const sections = new Map<string, ProgrammeSection>();
    for (const row of rows) {
        let section = sections.get(row.programme_id);
        if (!section) {
            section = {programmeId: row.programme_id, programmeName: row.programme_name, rows: []};
            sections.set(row.programme_id, section);
        }
        section.rows.push({
            ppnId: row.ppn_id,
            produitName: row.produit_name,
            unit: row.produit_unit,
            ligneId: row.ligne_id,
            ligne: toLigne(row),
            previousSduFinMois: row.prev_sdu_fin_mois,
            archived: row.produit_actif === 0,
        });
    }
    return Array.from(sections.values());
}

export async function getDetailSdu(rapportfsLigneId: string): Promise<DetailSDU[]> {
    const db = await getDb();
    return db.select<DetailSDU[]>(
        `SELECT id, sdu, date_peremption
         FROM detail_sdu
         WHERE rapportfs_ligne_id = $1
         ORDER BY date_peremption`,
        [rapportfsLigneId],
    );
}

// Creates the rapportfs_ligne row for this produit_programme_niveau if it
// doesn't exist yet (row.ligne was null), otherwise updates it in place.
// Returns the row's id (the existing one when updating), so the caller can
// attach detail_sdu entries to it even for a brand-new ligne.
// The produit's labels are copied onto the line as it is written, off the
// configuration in force at that moment: that is the record of what the person
// filling the form actually saw, and it must not change when the configuration
// later does. Written on insert only, never on update.
export async function saveRapportFsLigne(
    rapportfsId: string,
    produitProgrammeNiveauId: string,
    ligne: RapportHopitauxLigne,
): Promise<string> {
    const db = await getDb();
    const rows = await db.select<{ id: string }[]>(
        `INSERT INTO rapportfs_ligne (id, rapportfs_id, produit_programme_niveau_id, qte_dispo_deb_mois,
                                       qte_rec_mois, qte_dist_patient, qte_perime_avarie_mois,
                                       qte_redepl_mois, nb_jour_rupture, stock_theorique, sdu_fin_mois, ecart,
                                       cmm, cmma, msd, situation, observation,
                                       produit_code, produit_name, produit_unit, produit_unit_id, programme_name)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                COALESCE(p.code, ''), p.name, COALESCE(ppn.report_unit, p.unit), ppn.report_unit_id, pr.name
         FROM produit_programme_niveau ppn
                  JOIN produit p ON p.id = ppn.produit_id
                  JOIN programme pr ON pr.id = ppn.programme_id
         WHERE ppn.id = $3
         ON CONFLICT(rapportfs_id, produit_programme_niveau_id) DO UPDATE SET
             qte_dispo_deb_mois     = excluded.qte_dispo_deb_mois,
             qte_rec_mois           = excluded.qte_rec_mois,
             qte_dist_patient       = excluded.qte_dist_patient,
             qte_perime_avarie_mois = excluded.qte_perime_avarie_mois,
             qte_redepl_mois        = excluded.qte_redepl_mois,
             nb_jour_rupture        = excluded.nb_jour_rupture,
             stock_theorique        = excluded.stock_theorique,
             sdu_fin_mois           = excluded.sdu_fin_mois,
             ecart                  = excluded.ecart,
             cmm                    = excluded.cmm,
             cmma                   = excluded.cmma,
             msd                    = excluded.msd,
             situation              = excluded.situation,
             observation            = excluded.observation
         RETURNING id`,
        [
            generateUuid(),
            rapportfsId,
            produitProgrammeNiveauId,
            ligne.qte_dispo_deb_mois,
            ligne.qte_rec_mois,
            ligne.qte_dist_patient,
            ligne.qte_perime_avarie_mois,
            ligne.qte_redepl_mois,
            ligne.nb_jour_rupture,
            ligne.stock_theorique,
            ligne.sdu_fin_mois,
            ligne.ecart,
            ligne.cmm,
            ligne.cmma,
            ligne.msd,
            ligne.situation,
            ligne.observation,
        ],
    );
    return rows[0].id;
}

interface CarryLigneRow {
    id: string;
    qte_dispo_deb_mois: number | null;
    qte_rec_mois: number | null;
    qte_dist_patient: number | null;
    qte_perime_avarie_mois: number | null;
    qte_redepl_mois: number | null;
    sdu_fin_mois: number | null;
}

// A month's opening stock is the closing stock of the month before it, so
// editing a past month's sdu_fin_mois leaves every later consecutive month's
// qte_dispo_deb_mois — and the stock_theorique / ecart derived from it —
// stale. Walks that chain forward (same fs_id) for the produit that was just
// saved and rewrites the lines that already hold a figure.
//
// A month whose line doesn't exist yet, or whose qte_dispo_deb_mois was never
// entered, is left untouched and ends the walk: it already picks the fresh
// value up from previousSduFinMois when it is opened, and it has no closing
// stock of its own to pass any further.
//
// Only values that were already non-null are rewritten, so no rapportfs can
// change completeness here and statuses stay as they are. Returns the ids of
// the rapportfs actually updated.
export async function propagateQteDispoDebMois(
    rapportfsId: string,
    produitProgrammeNiveauId: string,
    sduFinMois: number | null,
): Promise<string[]> {
    const db = await getDb();
    const current = await db.select<{ mois_annee: string | null; fs_id: string }[]>(
        `SELECT mois_annee, fs_id
         FROM rapportfs
         WHERE id = $1`,
        [rapportfsId],
    );
    let ym = parseMoisAnnee(current[0]?.mois_annee ?? null);
    if (!ym) return [];

    const siblings = await db.select<{ id: string; mois_annee: string | null }[]>(
        `SELECT id, mois_annee
         FROM rapportfs
         WHERE fs_id = $1
           AND id != $2`,
        [current[0].fs_id, rapportfsId],
    );
    const byMonth = new Map<string, string>();
    for (const sibling of siblings) {
        const sym = parseMoisAnnee(sibling.mois_annee);
        if (sym) byMonth.set(monthKey(sym), sibling.id);
    }

    const num = (value: number | null) => value ?? 0;
    const touched: string[] = [];
    let carry = sduFinMois;

    for (; ;) {
        ym = shiftMonths(ym, 1);
        const nextId = byMonth.get(monthKey(ym));
        if (!nextId || carry === null) break;

        const lignes = await db.select<CarryLigneRow[]>(
            `SELECT id,
                    qte_dispo_deb_mois,
                    qte_rec_mois,
                    qte_dist_patient,
                    qte_perime_avarie_mois,
                    qte_redepl_mois,
                    sdu_fin_mois
             FROM rapportfs_ligne
             WHERE rapportfs_id = $1
               AND produit_programme_niveau_id = $2`,
            [nextId, produitProgrammeNiveauId],
        );
        const ligne = lignes[0];
        if (!ligne || ligne.qte_dispo_deb_mois === null) break;

        if (ligne.qte_dispo_deb_mois !== carry) {
            // Same formulas as the edit form's computeValues, so a line
            // rewritten here matches what saving it by hand would produce.
            const stockTheorique =
                carry +
                num(ligne.qte_rec_mois) -
                num(ligne.qte_redepl_mois) -
                num(ligne.qte_dist_patient) -
                num(ligne.qte_perime_avarie_mois);
            const ecart = num(ligne.sdu_fin_mois) - stockTheorique;
            await db.execute(
                `UPDATE rapportfs_ligne
                 SET qte_dispo_deb_mois = $1,
                     stock_theorique    = $2,
                     ecart              = $3
                 WHERE id = $4`,
                [carry, stockTheorique, ecart, ligne.id],
            );
            touched.push(nextId);
        }
        carry = ligne.sdu_fin_mois;
    }

    return touched;
}

export interface DetailSduInput {
    sdu: number;
    date_peremption: string | null;
}

// Replaces the full list of detail_sdu rows attached to a rapportfs_ligne.
export async function saveDetailSdu(rapportfsLigneId: string, entries: DetailSduInput[]): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM detail_sdu WHERE rapportfs_ligne_id = $1", [rapportfsLigneId]);
    for (const entry of entries) {
        await db.execute(
            "INSERT INTO detail_sdu (id, rapportfs_ligne_id, sdu, date_peremption) VALUES ($1, $2, $3, $4)",
            [generateUuid(), rapportfsLigneId, entry.sdu, entry.date_peremption],
        );
    }
}
