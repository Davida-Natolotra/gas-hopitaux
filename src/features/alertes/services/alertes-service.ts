import type {RapportFs} from "../../rapports/model/rapport-model.ts";
import {listRapportFs} from "../../rapports/services/rapportfs-service.ts";
import {getProgrammeSections} from "../../rapports/services/rapport-view-service.ts";
import {getMyOrganisationUnit} from "../../organisation-units/organisation-units-service.ts";
import {parseMoisAnnee} from "../../../utils/mois-annee.ts";

export interface AlerteProduit {
    ppnId: string;
    produitName: string;
    unit: string;
}

export interface AlertesProgrammeSection {
    programmeId: string;
    programmeName: string;
    totalProduits: number;
    rupture: AlerteProduit[];
    sousStock: AlerteProduit[];
}

// The rapportfs (for the saved FS) whose mois_annee is the most recent —
// mois_annee mixes "YYYY-MM" and "YYYY-MM-DD" across rows (see mois-annee.ts),
// so months are compared numerically rather than by raw string sort.
export async function getLatestRapportFs(): Promise<RapportFs | null> {
    const orgUnit = await getMyOrganisationUnit();
    if (!orgUnit) return null;

    const all = await listRapportFs();
    let latest: RapportFs | null = null;
    let latestRank = -Infinity;
    for (const report of all) {
        if (report.fs_id !== orgUnit.fs.id) continue;
        const ym = parseMoisAnnee(report.mois_annee);
        if (!ym) continue;
        const rank = ym.year * 12 + ym.month;
        if (rank > latestRank) {
            latestRank = rank;
            latest = report;
        }
    }
    return latest;
}

// Per-programme breakdown of the given rapportfs's produits currently in
// RUPTURE or SOUS STOCK, for the "Alertes stock" page.
export async function getAlertesSections(rapportfsId: string): Promise<AlertesProgrammeSection[]> {
    const sections = await getProgrammeSections(rapportfsId);
    return sections.map((section) => ({
        programmeId: section.programmeId,
        programmeName: section.programmeName,
        totalProduits: section.rows.length,
        rupture: section.rows
            .filter((row) => row.ligne?.situation === "RUPTURE")
            .map((row) => ({ppnId: row.ppnId, produitName: row.produitName, unit: row.unit})),
        sousStock: section.rows
            .filter((row) => row.ligne?.situation === "SOUS STOCK")
            .map((row) => ({ppnId: row.ppnId, produitName: row.produitName, unit: row.unit})),
    }));
}
