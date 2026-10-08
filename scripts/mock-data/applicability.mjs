// The applicability rule on the configuration file itself, for the seeders.
//
// A facility owes a produit_programme_niveau when it is a member of at least one of
// the row's categories (CSB, HOPITAUX, CTTR, CDT, …). Categories are not mutually
// exclusive, so a facility in several still owes the row once.
//
// The app applies the same rule in SQL (src/features/configuration/services/
// applicability.ts); verify.mjs restates it in SQL against the generated database,
// so the two have to agree for a seed to pass.

/** Indexes a schema-5 configuration file for the rule below. */
export function indexConfiguration(config) {
    const categoryById = new Map(config.categories.map((category) => [category.id, category]));
    const categoryMembers = new Map(config.categories.map((category) => [category.id, new Set(category.organisation_units)]));
    const categoryNamed = (name) => config.categories.find((category) => category.name.toUpperCase() === name.toUpperCase());
    return {categoryById, categoryMembers, categoryNamed};
}

/** Whether `ouId` owes `ppn`. */
export function appliesTo(index, ppn, ouId) {
    return (ppn.category_ids ?? []).some((id) => index.categoryMembers.get(id)?.has(ouId));
}

/** The names of a row's categories, sorted — what the import stores as its niveau. */
export function categoryNames(index, ppn) {
    return (ppn.category_ids ?? []).map((id) => index.categoryById.get(id)?.name ?? id).sort();
}

/**
 * The niveau label the app gives a row on a device: the categories it reaches the
 * facilities through — "CSB", "CDT", "CSB, CTTR". `ouIds` limits them to those the
 * given facilities belong to; null names them all.
 */
export function niveauLabel(index, ppn, ouIds = null) {
    return (ppn.category_ids ?? [])
        .filter((id) => ouIds === null || ouIds.some((ouId) => index.categoryMembers.get(id)?.has(ouId)))
        .map((id) => index.categoryById.get(id)?.name)
        .filter(Boolean)
        .sort()
        .join(", ");
}
