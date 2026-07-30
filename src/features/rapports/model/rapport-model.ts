import type {userFS} from "../../userprofile/models/user-interface.ts"

export interface RapportHopitauxLigne {
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
    detail_sdu: DetailSDU[] | null;
}

export interface DetailSDU {
    id: string;
    sdu: number;
    date_peremption: string | null;
}

export interface RapportHopitaux {
    id: string;
    name: string;
    sdsp_id: string;
    mois_annee: string | null;
    created: string;
    status: boolean;
    exported_date: string | null;// null for rapport-attached, set for standalone
    // null until someone (this device's user_fs profile) has actually saved
    // a line on this rapport.
    edited_by: userFS | null;
    rapportfsLigne: RapportHopitauxLigne[];
}

