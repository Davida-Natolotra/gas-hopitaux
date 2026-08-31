// The app's own derivations, transcribed from the source so generated rows hold
// exactly what saving the same figures through the UI would have written.
//
//   computeValues / computeSituation
//       src/features/rapports/components/rapport-programme-table.tsx
//   MANDATORY_LIGNE_FIELDS
//       src/features/rapports/model/rapport-completeness.ts
//   applyCmmToTarget
//       src/features/rapports/services/rapport-cmm-service.ts
//
// The generator writes rows from these; the verifier reads the rows back and
// checks them against these. Keep them in step with the app: if a formula there
// changes, this file is the one place to follow it.

const num = (value) => (value === null || value === undefined || !Number.isFinite(value) ? 0 : value);

export function stockTheorique(ligne) {
    return (
        num(ligne.qte_dispo_deb_mois) +
        num(ligne.qte_rec_mois) -
        num(ligne.qte_redepl_mois) -
        num(ligne.qte_dist_patient) -
        num(ligne.qte_perime_avarie_mois)
    );
}

/**
 * SDU fin du mois is the sum of the line's Détails SDU — and stays null when
 * there are none at all, because "no closing stock recorded" is not the same
 * claim as "closing stock of zero". A single détail holding 0 *is* a recorded
 * zero, and sums to 0.
 */
export function sduFinMois(detailSdu) {
    if (!detailSdu || detailSdu.length === 0) return null;
    return detailSdu.reduce((sum, row) => sum + num(row.sdu), 0);
}

export function ecart(sdu, stock) {
    return sdu === null ? null : sdu - stock;
}

export function msd(sdu, cmm) {
    return sdu !== null && cmm ? Math.round((sdu / cmm) * 100) / 100 : 0;
}

export function computeSituation(value) {
    if (value > 4) return "SURSTOCK";
    if (value >= 2) return "NORMAL";
    if (value > 0) return "SOUS STOCK";
    return "RUPTURE";
}

/** Blank while there is no closing stock at all, rather than claiming RUPTURE. */
export function situationFor(sdu, msdValue) {
    return sdu === null ? "" : computeSituation(msdValue);
}

export const MANDATORY_LIGNE_FIELDS = [
    "qte_dispo_deb_mois",
    "qte_rec_mois",
    "qte_dist_patient",
    "qte_perime_avarie_mois",
    "qte_redepl_mois",
    "nb_jour_rupture",
    "sdu_fin_mois",
    "cmm",
];

export function isLigneComplete(ligne) {
    if (!ligne) return false;
    return MANDATORY_LIGNE_FIELDS.every((field) => ligne[field] !== null && ligne[field] !== undefined);
}

/**
 * CMM/CMMA off the three months preceding a report, as computeRollingCmm writes
 * them onto the fourth. `history` is those three months' lines for one produit,
 * oldest first; a month only counts once it has actually been reported.
 */
export function rollingCmm(history) {
    const reported = history.every(
        (row) => row && row.qte_dist_patient !== null && row.nb_jour_rupture !== null,
    );
    if (history.length !== 3 || !reported) return null;

    const sommeTotale = history.reduce((sum, row) => sum + num(row.qte_dist_patient), 0);
    const totalRupture = history.reduce((sum, row) => sum + num(row.nb_jour_rupture), 0);
    return {
        cmm: Math.round(sommeTotale / 3),
        cmma: totalRupture > 0 ? (sommeTotale * 30) / (90 - totalRupture) : null,
    };
}
