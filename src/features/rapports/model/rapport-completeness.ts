import type {RapportHopitauxLigne} from "./rapport-model.ts";

// The fields that must be filled in for a produit's line to count as
// "Complet" — kept in sync with the edit form in rapport-programme-table.tsx.
// Excludes the derived/auto-computed fields (stock_theorique, ecart,
// sdu_fin_mois, msd), CMMA (not required), and Observation (not part of this
// numeric field set at all).
export const MANDATORY_LIGNE_FIELDS: (keyof RapportHopitauxLigne)[] = [
    "qte_dispo_deb_mois",
    "qte_rec_mois",
    "qte_dist_patient",
    "qte_dist_ac",
    "qte_perime_avarie_mois",
    "qte_redepl_mois",
    "nb_jour_rupture",
    "cmm",
];

export function isLigneComplete(ligne: RapportHopitauxLigne | null): boolean {
    if (!ligne) return false;
    return MANDATORY_LIGNE_FIELDS.every((key) => ligne[key] !== null);
}
