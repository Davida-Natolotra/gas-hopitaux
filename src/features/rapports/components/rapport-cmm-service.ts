import {getDb} from "../../../services/db.ts";
import type {RapportFs} from "../model/rapport-model.ts";
import {refreshRapportFsStatus} from "./rapportfs-service.ts";
import {monthKey, parseMoisAnnee, shiftMonths} from "../../../utils/mois-annee.ts";

// CMM (Consommation Moyenne Mensuelle) requires 4 consecutive months of
// history (same fs_id): once a rapportfs's mois_annee is the 4th in such a
// run, each produit reported in the 3 *preceding* months gets its CMM (and,
// if any breakage occurred, CMMA) computed from those 3 months and written
// onto the 4th month's line. The 4th month's own consumption is not part of
// the average — its line is created (with only cmm/cmma set) if it doesn't
// exist yet, so the value shows up without requiring the user to have
// touched that produit for the 4th month first.

interface LigneRow {
    rapportfs_id: string;
    produit_programme_niveau_id: string;
    qte_dist_patient: number | null;
    qte_dist_ac: number | null;
    nb_jour_rupture: number | null;
}

// A month only counts toward the average once it has actually been reported
// (not just a placeholder row — e.g. one auto-created by this same function
// on a prior run, which would otherwise look "recorded" with 0 consumption).
function isReported(row: LigneRow | undefined): row is LigneRow {
    return (
        row !== undefined &&
        row.qte_dist_patient !== null &&
        row.qte_dist_ac !== null &&
        row.nb_jour_rupture !== null
    );
}

// Computes CMM/CMMA from the 3 months preceding `targetId` and persists them
// onto `targetId`'s matching rapportfs_ligne rows (creating the line if it
// doesn't exist yet). Only produits actually reported in all 3 preceding
// months are touched.
async function applyCmmToTarget(firstId: string, secondId: string, thirdId: string, targetId: string): Promise<boolean> {
    const db = await getDb();
    const rows = await db.select<LigneRow[]>(
        `SELECT rapportfs_id, produit_programme_niveau_id, qte_dist_patient, qte_dist_ac, nb_jour_rupture
         FROM rapportfs_ligne
         WHERE rapportfs_id = $1
            OR rapportfs_id = $2
            OR rapportfs_id = $3`,
        [firstId, secondId, thirdId],
    );

    const byProduit = new Map<string, Map<string, LigneRow>>();
    for (const row of rows) {
        let byMonth = byProduit.get(row.produit_programme_niveau_id);
        if (!byMonth) {
            byMonth = new Map();
            byProduit.set(row.produit_programme_niveau_id, byMonth);
        }
        byMonth.set(row.rapportfs_id, row);
    }

    let updated = false;
    for (const [produitProgrammeNiveauId, byMonth] of byProduit) {
        const first = byMonth.get(firstId);
        const second = byMonth.get(secondId);
        const third = byMonth.get(thirdId);
        if (!isReported(first) || !isReported(second) || !isReported(third)) continue;

        const somme1 = (first.qte_dist_patient ?? 0) + (first.qte_dist_ac ?? 0);
        const somme2 = (second.qte_dist_patient ?? 0) + (second.qte_dist_ac ?? 0);
        const somme3 = (third.qte_dist_patient ?? 0) + (third.qte_dist_ac ?? 0);
        const sommeTotale = somme1 + somme2 + somme3;

        const totalRupture =
            (first.nb_jour_rupture ?? 0) + (second.nb_jour_rupture ?? 0) + (third.nb_jour_rupture ?? 0);

        const cmm = Math.round(sommeTotale / 3);
        const cmma = totalRupture > 0 ? (sommeTotale * 30) / (90 - totalRupture) : null;

        const result = await db.execute(
            `INSERT INTO rapportfs_ligne (id, rapportfs_id, produit_programme_niveau_id, cmm, cmma)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT(rapportfs_id, produit_programme_niveau_id) DO UPDATE SET
                 cmm  = excluded.cmm,
                 cmma = excluded.cmma`,
            [crypto.randomUUID(), targetId, produitProgrammeNiveauId, cmm, cmma],
        );
        if (result.rowsAffected > 0) updated = true;
    }
    return updated;
}

// Scans every rapportfs, finds each one preceded by 3 consecutive prior
// months (same fs_id), and writes CMM/CMMA (computed from those 3 prior
// months) onto that 4th month's lines. Called both when the rapportfs-list
// page loads and right after a new rapportfs is created, so the 4th
// consecutive month gets its CMM as soon as it exists rather than only after
// the next list-page visit. Returns the ids of rapportfs whose lines were
// touched, so callers can refresh their derived "status".
export async function computeRollingCmm(reports: RapportFs[]): Promise<string[]> {
    const byFs = new Map<string, RapportFs[]>();
    for (const report of reports) {
        const list = byFs.get(report.fs_id) ?? [];
        list.push(report);
        byFs.set(report.fs_id, list);
    }

    const touchedIds: string[] = [];
    for (const list of byFs.values()) {
        const byMonth = new Map<string, RapportFs>();
        for (const report of list) {
            const ym = parseMoisAnnee(report.mois_annee);
            if (!ym) continue;
            byMonth.set(monthKey(ym), report);
        }

        for (const target of list) {
            const ymTarget = parseMoisAnnee(target.mois_annee);
            if (!ymTarget) continue;

            const third = byMonth.get(monthKey(shiftMonths(ymTarget, -1)));
            const second = byMonth.get(monthKey(shiftMonths(ymTarget, -2)));
            const first = byMonth.get(monthKey(shiftMonths(ymTarget, -3)));
            if (!first || !second || !third) continue; // no consecutive run of 4 ending here

            const updated = await applyCmmToTarget(first.id, second.id, third.id, target.id);
            if (updated) touchedIds.push(target.id);
        }
    }

    for (const id of touchedIds) {
        await refreshRapportFsStatus(id);
    }
    return touchedIds;
}
