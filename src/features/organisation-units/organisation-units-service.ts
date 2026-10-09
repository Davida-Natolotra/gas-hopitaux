import {getDb} from "../../services/db.ts";
import {
    APP_GAS_HOPITAUX,
    inAppRoster,
    niveauLabel,
    ppnOwedBy,
} from "../configuration/services/applicability.ts";
import type {MyOrganisationUnit, OrganisationUnit} from "./organisation-unit-model.ts";

// Levels: 1=pays, 2=DRSP/région, 3=SDSP/district, 4=commune, 5=FS. Level 6+
// (if present in a config export) is not used by this cascade, matching
// utgl-csb's own organisation-unit selector.
export async function listOrganisationUnits(): Promise<OrganisationUnit[]> {
    const db = await getDb();
    return db.select<OrganisationUnit[]>(
        `SELECT id, name, level, parent_id
         FROM organisation_units
         WHERE level BETWEEN 2 AND 5`,
    );
}

/**
 * Ids of GAS-Hôpitaux's roster — the members of the categories the server's
 * Assignation gives it (HOPITAUX by default): the facilities this build collects
 * for. Membership, not anything in the unit's name, is what makes a facility
 * a hospital: the export mixes CHRR/CHRD2/HP/clinique naming. It is also a
 * category produits are configured for, so the facilities offered here are those
 * the configuration has produits for.
 */
export async function listHopitauxUnitIds(): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<{ ou_id: string }[]>(
        `SELECT m.ou_id
         FROM category_member m
                  JOIN category c ON c.id = m.category_id
         WHERE ${inAppRoster("c", APP_GAS_HOPITAUX)}`,
    );
    return rows.map((row) => row.ou_id);
}

interface MyOrganisationUnitRow {
    drsp_id: string;
    drsp_name: string;
    drsp_level: number;
    drsp_parent_id: string | null;
    sdsp_id: string;
    sdsp_name: string;
    sdsp_level: number;
    sdsp_parent_id: string | null;
    commune_id: string | null;
    commune_name: string | null;
    commune_level: number | null;
    commune_parent_id: string | null;
    fs_id: string;
    fs_name: string;
    fs_level: number;
    fs_parent_id: string | null;
}

export async function getMyOrganisationUnit(): Promise<MyOrganisationUnit | null> {
    const db = await getDb();
    const rows = await db.select<MyOrganisationUnitRow[]>(
        `SELECT drsp.id    AS drsp_id, drsp.name AS drsp_name, drsp.level AS drsp_level, drsp.parent_id AS drsp_parent_id,
                sdsp.id    AS sdsp_id, sdsp.name AS sdsp_name, sdsp.level AS sdsp_level, sdsp.parent_id AS sdsp_parent_id,
                commune.id AS commune_id, commune.name AS commune_name, commune.level AS commune_level,
                commune.parent_id AS commune_parent_id,
                fs.id      AS fs_id, fs.name AS fs_name, fs.level AS fs_level, fs.parent_id AS fs_parent_id
         FROM my_organisation_unit m
                  JOIN organisation_units drsp ON drsp.id = m.drsp_id
                  JOIN organisation_units sdsp ON sdsp.id = m.sdsp_id
                  LEFT JOIN organisation_units commune ON commune.id = m.commune_id
                  JOIN organisation_units fs ON fs.id = m.fs_id
         WHERE m.id = 1`,
    );
    const row = rows[0];
    if (!row) return null;

    return {
        drsp: {id: row.drsp_id, name: row.drsp_name, level: row.drsp_level, parent_id: row.drsp_parent_id},
        sdsp: {id: row.sdsp_id, name: row.sdsp_name, level: row.sdsp_level, parent_id: row.sdsp_parent_id},
        commune: row.commune_id
            ? {id: row.commune_id, name: row.commune_name!, level: row.commune_level!, parent_id: row.commune_parent_id!}
            : null,
        fs: {id: row.fs_id, name: row.fs_name, level: row.fs_level, parent_id: row.fs_parent_id},
    };
}

export async function saveMyOrganisationUnit(input: {
    drspId: string;
    sdspId: string;
    communeId: string | null;
    fsId: string;
}): Promise<void> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO my_organisation_unit (id, drsp_id, sdsp_id, commune_id, fs_id)
         VALUES (1, $1, $2, $3, $4)
         ON CONFLICT(id) DO UPDATE SET drsp_id    = excluded.drsp_id,
                                        sdsp_id    = excluded.sdsp_id,
                                        commune_id = excluded.commune_id,
                                        fs_id      = excluded.fs_id`,
        [input.drspId, input.sdspId, input.communeId, input.fsId],
    );
    await refreshMyProduitProgrammeNiveau();
}

/**
 * Rebuilds my_produitprogrammeniveau: the produits the saved hospital owes — those
 * configured for any category it is a member of: HOPITAUX, and CDT, CR, … when it
 * is one too, e.g. TB produits for a hospital that is a CDT (see
 * configuration/services/applicability.ts). Each row's niveau is relabelled with
 * the categories it reaches the hospital through ("HOPITAUX", "CDT"). Rows from before configuration schema 4
 * stay under their old group rule, archived, so reports captured against them
 * keep their lines. Must be re-run whenever the saved FS changes or the
 * configuration is re-imported.
 *
 * `active`/`archived_at` are copied across rather than left to the column
 * defaults. This is a DELETE-then-INSERT, so defaulting them would silently
 * un-retire every withdrawn produit each time it runs — harmless during a config
 * import, where applyTombstones re-marks them immediately afterwards, but not
 * when the FS is changed, which calls this on its own. A produit the server has
 * withdrawn would have come back into collection with nothing to show for it.
 */
export async function refreshMyProduitProgrammeNiveau(): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM my_produitprogrammeniveau");
    await db.execute(
        `INSERT INTO my_produitprogrammeniveau (id, produit_id, programme_id, org_group_id, org_group_name,
                                                "order", active, archived_at)
         SELECT ppn.id, ppn.produit_id, ppn.programme_id, ppn.org_group_id,
                ${niveauLabel("ppn", "SELECT fs_id FROM my_organisation_unit WHERE id = 1")},
                ppn."order", ppn.active, ppn.archived_at
         FROM produit_programme_niveau ppn
         WHERE ${ppnOwedBy("ppn", "(SELECT fs_id FROM my_organisation_unit WHERE id = 1)")}`,
    );
}

// Used by the startup routing check: whether the saved FS actually has any
// applicable produits yet (i.e. a config was imported and matches its type).
export async function hasAnyMyProduitProgrammeNiveau(): Promise<boolean> {
    const db = await getDb();
    const rows = await db.select<unknown[]>("SELECT 1 FROM my_produitprogrammeniveau LIMIT 1");
    return rows.length > 0;
}

export interface ProduitSummary {
    ppnId: string;
    produitName: string;
    unit: string;
    // The categories the saved hospital reports this produit through ("HOPITAUX",
    // "CDT, LRR"): its row's niveau label.
    niveau: string;
}

export interface ProgrammeProduits {
    programmeId: string;
    programmeName: string;
    // Every category the saved hospital reports this programme's produits through
    // ("CDT", "CRPC", "LRR"), each once. A produit's niveau can name several, so
    // the produits' labels themselves cannot simply be listed: "CDT, LRR" and
    // "CDT, CRPC" would show CDT twice.
    niveaux: string[];
    produits: ProduitSummary[];
}

interface ProduitProgrammeRow {
    programme_id: string;
    programme_name: string;
    ppn_id: string;
    produit_name: string;
    produit_unit: string;
    org_group_name: string;
}

// The saved FS's applicable produits (my_produitprogrammeniveau), grouped by
// programme — used to show what a config import actually configured.
//
// Withdrawn rows are left out: this is the list of what to report, and a produit
// the configuration has retired is not reported any more. It stays visible only
// where it was already captured, on the reports themselves.
export async function listMyProduitsByProgramme(): Promise<ProgrammeProduits[]> {
    const db = await getDb();
    const rows = await db.select<ProduitProgrammeRow[]>(
        `SELECT pr.id               AS programme_id,
                pr.name             AS programme_name,
                mppn.id             AS ppn_id,
                p.name              AS produit_name,
                COALESCE(fppn.report_unit, p.unit) AS produit_unit,
                mppn.org_group_name AS org_group_name
         FROM my_produitprogrammeniveau mppn
                  JOIN produit p ON p.id = mppn.produit_id
                  -- The unit this app reports the row in: on the full row, which the import sets.
                  LEFT JOIN produit_programme_niveau fppn ON fppn.id = mppn.id
                  JOIN programme pr ON pr.id = mppn.programme_id
         WHERE mppn.active = 1
         ORDER BY pr.name, (mppn."order" IS NULL), mppn."order", p.name`,
    );

    const sections = new Map<string, ProgrammeProduits>();
    const niveauxByProgramme = new Map<string, Set<string>>();
    for (const row of rows) {
        let section = sections.get(row.programme_id);
        if (!section) {
            section = {programmeId: row.programme_id, programmeName: row.programme_name, niveaux: [], produits: []};
            sections.set(row.programme_id, section);
            niveauxByProgramme.set(row.programme_id, new Set());
        }
        // The label is niveauLabel()'s ", "-joined category names (applicability.ts).
        for (const category of row.org_group_name.split(", ")) {
            if (category) niveauxByProgramme.get(row.programme_id)!.add(category);
        }
        section.produits.push({
            ppnId: row.ppn_id,
            produitName: row.produit_name,
            unit: row.produit_unit,
            niveau: row.org_group_name,
        });
    }
    for (const section of sections.values()) {
        section.niveaux = Array.from(niveauxByProgramme.get(section.programmeId)!).sort();
    }
    return Array.from(sections.values());
}
