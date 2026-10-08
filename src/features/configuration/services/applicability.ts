/**
 * Which produits a facility owes — the one rule, shared by every query that asks.
 *
 * A facility owes a produit_programme_niveau when it is a member of at least one of
 * the row's categories (CSB, HOPITAUX, CTTR, CDT, …). Categories are not mutually
 * exclusive, so a facility in several of a row's categories still owes it once — the
 * duplicate the old one-row-per-organisation-unit-group configuration produced.
 *
 * Same rule as the server's configuration/applicability.py. The two must agree, or the
 * server's dashboards would expect produits this device never offered.
 *
 * Every helper returns a SQL fragment. `ppn` is the alias of a row carrying `id`,
 * `org_group_id` and `org_group_name` (produit_programme_niveau or
 * my_produitprogrammeniveau).
 */

/** The categories that are a report family's roster — each app's target — by their
 *  server names: GAS-FS collects for CSB, GAS-Hopitaux for HOPITAUX, GAS-PhaGDis (and
 *  GAS-District's PhaGDis screens) for PhaGDis, whose members are districts. */
export const CATEGORY_CSB = "CSB";
export const CATEGORY_HOPITAUX = "HOPITAUX";
export const CATEGORY_PHAGDIS = "PhaGDis";

/** Each app's code in the configuration's `apps` (schema 6), and the category its
 *  roster was by name before that. */
export const APP_GAS_FS = "GAS-FS";
export const APP_GAS_DISTRICT = "GAS-District";
export const APP_GAS_PHAGDIS = "GAS-PhaGDis";
export const APP_GAS_HOPITAUX = "GAS-Hopitaux";

const DEFAULT_ROSTER: Record<string, string> = {
    [APP_GAS_FS]: CATEGORY_CSB,
    [APP_GAS_DISTRICT]: CATEGORY_CSB,
    [APP_GAS_PHAGDIS]: CATEGORY_PHAGDIS,
    [APP_GAS_HOPITAUX]: CATEGORY_HOPITAUX,
};

/**
 * Condition: the category `category` (the alias of a `category` row) is one of the
 * categories `app` serves — its roster, as the server's Assignation sets it
 * (app_category, from a schema 6 configuration). Same rule as the server's
 * configuration/assignation.py.
 *
 * Before any schema 6 configuration was imported app_category holds nothing for the
 * app, and the roster is the category the app was built around, by name.
 */
export function inAppRoster(category: string, app: string): string {
    return `(${category}.id IN (SELECT ac.category_id FROM app_category ac WHERE ac.app = '${app}')
            OR (NOT EXISTS (SELECT 1 FROM app_category ac WHERE ac.app = '${app}')
                AND ${category}.name = '${DEFAULT_ROSTER[app]}' COLLATE NOCASE))`;
}

/** Condition: the row is owed by the organisation unit `ou` (a SQL expression for its id). */
export function ppnAppliesTo(ppn: string, ou: string): string {
    return `EXISTS (SELECT 1
                   FROM produit_programme_niveau_category pc
                            JOIN category_member cm ON cm.category_id = pc.category_id
                   WHERE pc.ppn_id = ${ppn}.id
                     AND cm.ou_id = ${ou})`;
}

/**
 * Condition: a row imported before produits were configured by category — it has no
 * categories and is still scoped to an organisation unit group — that `ou` belonged to
 * the group of.
 *
 * The server retired those rows when it folded them into one row per (produit,
 * programme), so they are all archived here and never offered for a new month. They
 * are kept in the device's subset only so that reports already captured against them
 * keep showing their lines; dropping them would make those lines vanish from the
 * screens that list a report's produits.
 */
export function legacyPpnAppliesTo(ppn: string, ou: string): string {
    return `(NOT EXISTS (SELECT 1 FROM produit_programme_niveau_category pc WHERE pc.ppn_id = ${ppn}.id)
            AND ${ppn}.org_group_id IN (SELECT ougm.group_id
                                        FROM organisation_unit_group_member ougm
                                        WHERE ougm.ou_id = ${ou}))`;
}

/**
 * Condition: the row is one a PhaGDis report covers — it is configured for one of
 * GAS-PhaGDis's categories (PhaGDis by default), and the district `sdsp` (a SQL
 * expression for its id) is a member of it. Same rule as the server's PhaGDis
 * dashboard.
 *
 * Rows imported before produits were configured by category (no categories,
 * archived) are kept for the reports already captured against them, outside the
 * HOPITAUX group and within `legacyScope` — a SQL condition on `ppn` saying which old
 * groups this device collected for.
 */
export function ppnForPhagdis(ppn: string, sdsp: string, legacyScope: string): string {
    return `(EXISTS (SELECT 1
                    FROM produit_programme_niveau_category pc
                             JOIN category c ON c.id = pc.category_id
                             JOIN category_member cm ON cm.category_id = c.id
                    WHERE pc.ppn_id = ${ppn}.id
                      AND ${inAppRoster("c", APP_GAS_PHAGDIS)}
                      AND cm.ou_id = ${sdsp})
            OR (NOT EXISTS (SELECT 1 FROM produit_programme_niveau_category pc WHERE pc.ppn_id = ${ppn}.id)
                AND ${ppn}.org_group_name <> '${CATEGORY_HOPITAUX}' COLLATE NOCASE
                AND ${legacyScope}))`;
}

/**
 * The "niveau" a row is shown under: the categories it reaches the facilities through
 * — "CSB" for a produit a CSB reports as a CSB, "CDT" for one it reports as a CDT,
 * "CSB, CTTR" when both apply, "PhaGDis" for one a district reports as a PhaGDis.
 *
 * `ous` is a SQL expression listing the facilities whose categories count (for
 * `IN (...)`), or null to name every category of the row. Falls back to the row's
 * current label for a row with no matching category (one imported before produits
 * were configured by category).
 */
export function niveauLabel(ppn: string, ous: string | null): string {
    const memberOf = ous === null
        ? ""
        : `AND EXISTS (SELECT 1 FROM category_member cm WHERE cm.category_id = c.id AND cm.ou_id IN (${ous}))`;
    return `COALESCE((SELECT group_concat(name, ', ')
                      FROM (SELECT c.name
                            FROM produit_programme_niveau_category pc
                                     JOIN category c ON c.id = pc.category_id
                            WHERE pc.ppn_id = ${ppn}.id ${memberOf}
                            ORDER BY c.name)),
                     ${ppn}.org_group_name)`;
}
