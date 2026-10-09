// Reads the generated database back and checks it against the rules the app
// itself applies. This is the part that makes the script a test rather than a
// fixture dump: a seeder that writes rows nobody re-derives will happily produce
// a database the app disagrees with on the first screen that recomputes
// anything, and the disagreement then looks like an application bug.
//
// Every check runs; the failures are collected and reported together, because
// knowing that four rules broke at once says more than the first one alone.

import {daysInMonth, monthKey, parseMonthKey, shiftMonths} from "./months.mjs";
import {
    ecart as computeEcart,
    isLigneComplete,
    msd as computeMsd,
    rollingCmm,
    situationFor,
    stockTheorique,
} from "./formulas.mjs";

const MAX_REPORTED_FAILURES = 5;

function check(results, name, failures) {
    results.push({name, failures});
}

export function verifyDatabase(db) {
    const results = [];
    const all = (sql, params = []) => db.prepare(sql).all(...params);

    // ── The database itself ──────────────────────────────────────────────────
    const integrity = all("PRAGMA integrity_check").map((row) => Object.values(row)[0]);
    check(results, "intégrité SQLite", integrity.filter((value) => value !== "ok"));

    const fkViolations = all("PRAGMA foreign_key_check");
    check(
        results,
        "clés étrangères",
        fkViolations.map((row) => `${row.table} → ${row.parent} (rowid ${row.rowid})`),
    );

    // ── What the app expects to find on a configured device ──────────────────
    const singletons = [];
    for (const [table, where] of [
        ["config_version", "id = 1"],
        ["my_organisation_unit", "id = 1"],
        ["device", "id = 1"],
        ["user_fs", "1 = 1"],
    ]) {
        const count = all(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)[0].n;
        if (count !== 1) singletons.push(`${table} : ${count} ligne(s), 1 attendue`);
    }
    check(results, "lignes uniques de configuration du poste", singletons);

    // my_produitprogrammeniveau is a materialised view of a query
    // (refreshMyProduitProgrammeNiveau); if the seeded copy has drifted from it,
    // the report pages and the completeness check disagree about what this FS
    // even collects. The rule is restated here in SQL, independently of the
    // seeder's JavaScript copy of it: rows configured for a category the FS is a
    // member of — each labelled with those categories.
    const fs = "(SELECT fs_id FROM my_organisation_unit WHERE id = 1)";
    const expectedMyPpn = all(
        `SELECT ppn.id,
                (SELECT group_concat(name, ', ')
                 FROM (SELECT c.name
                       FROM produit_programme_niveau_category pc
                                JOIN category c ON c.id = pc.category_id
                                JOIN category_member cm ON cm.category_id = c.id AND cm.ou_id = ${fs}
                       WHERE pc.ppn_id = ppn.id
                       ORDER BY c.name)) AS niveau
         FROM produit_programme_niveau ppn
         WHERE EXISTS (SELECT 1
                       FROM produit_programme_niveau_category pc
                                JOIN category_member cm ON cm.category_id = pc.category_id
                       WHERE pc.ppn_id = ppn.id AND cm.ou_id = ${fs})`,
    );
    const actualMyPpn = all("SELECT id, org_group_name AS niveau FROM my_produitprogrammeniveau");
    const expectedById = new Map(expectedMyPpn.map((row) => [row.id, row.niveau]));
    const actualById = new Map(actualMyPpn.map((row) => [row.id, row.niveau]));
    const actualSet = new Set(actualById.keys());
    check(results, "my_produitprogrammeniveau = produits dus par la FS (ses catégories)", [
        ...[...expectedById.keys()].filter((id) => !actualById.has(id)).map((id) => `manquant : ${id}`),
        ...[...actualById.keys()].filter((id) => !expectedById.has(id)).map((id) => `en trop : ${id}`),
    ]);
    check(results, "niveau de chaque produit : les catégories de la FS qui le reçoivent", [...actualById]
        .filter(([id, niveau]) => expectedById.has(id) && expectedById.get(id) !== niveau)
        .map(([id, niveau]) => `${id} : « ${niveau} » au lieu de « ${expectedById.get(id)} »`));

    // A report collects a produit once per programme: the server configures one row
    // per produit × programme, whatever categories it is owed through. Two rows for
    // the same produit — by id, or by name, as the server's merge of same-named
    // copies decides it (configuration 0015) — would list it twice on every report.
    check(
        results,
        "un seul produit par programme parmi les produits à rapporter",
        all(`SELECT pr.name AS programme, p.name AS produit, COUNT(*) AS n
             FROM my_produitprogrammeniveau m
                      JOIN produit p ON p.id = m.produit_id
                      JOIN programme pr ON pr.id = m.programme_id
             WHERE m.active = 1
             GROUP BY m.programme_id, lower(trim(p.name))
             HAVING COUNT(*) > 1`)
            .map((row) => `${row.programme} : ${row.produit} ×${row.n}`),
    );

    // The cascade only offers the members of GAS-Hôpitaux's categories
    // (inAppRoster): an FS outside them is one the device could never have been set
    // up for.
    check(
        results,
        "la FS fait partie de la liste de GAS-Hôpitaux (Assignation)",
        all(`SELECT 1
             FROM app_category ac
                      JOIN category_member cm ON cm.category_id = ac.category_id
             WHERE ac.app = 'GAS-Hopitaux' AND cm.ou_id = ${fs}`).length > 0
            ? []
            : ["aucune catégorie de GAS-Hôpitaux ne compte la FS parmi ses membres"],
    );

    // Every row carries the unit this app reports it in (schema 6): new lines copy
    // it, and the server reads their quantities in it.
    check(
        results,
        "chaque liaison porte son unité de déclaration et son identifiant",
        all(`SELECT id FROM produit_programme_niveau
             WHERE report_unit IS NULL OR report_unit = '' OR report_unit_id IS NULL`)
            .map((row) => row.id),
    );

    // ── Reports ──────────────────────────────────────────────────────────────
    const rapports = all(
        `SELECT id, mois_annee, fs_id, status, config_version, edited_by, created, exported_date
         FROM rapportfs`,
    );
    const monthOf = new Map();
    const monthProblems = [];
    for (const rapport of rapports) {
        if (!rapport.mois_annee) {
            monthProblems.push(`${rapport.id} : mois_annee absent`);
            continue;
        }
        const key = monthKey(parseMonthKey(rapport.mois_annee));
        if (monthOf.has(key)) monthProblems.push(`mois ${key} rapporté deux fois`);
        monthOf.set(key, rapport);
    }
    check(results, "un rapport par mois, sans doublon", monthProblems);

    const configVersion = all("SELECT version FROM config_version WHERE id = 1")[0]?.version ?? null;
    check(
        results,
        "chaque rapport porte la version de configuration",
        rapports
            .filter((rapport) => rapport.config_version !== configVersion)
            .map((rapport) => `${rapport.mois_annee} : ${rapport.config_version} au lieu de ${configVersion}`),
    );

    // ── Lines ────────────────────────────────────────────────────────────────
    const lignes = all(
        `SELECT l.*, r.mois_annee, ppn.report_unit, ppn.report_unit_id
         FROM rapportfs_ligne l
                  JOIN rapportfs r ON r.id = l.rapportfs_id
                  JOIN produit_programme_niveau ppn ON ppn.id = l.produit_programme_niveau_id`,
    );
    const details = all("SELECT rapportfs_ligne_id, sdu, date_peremption FROM detail_sdu");
    const detailsByLigne = new Map();
    for (const detail of details) {
        const list = detailsByLigne.get(detail.rapportfs_ligne_id) ?? [];
        list.push(detail);
        detailsByLigne.set(detail.rapportfs_ligne_id, list);
    }

    const label = (ligne) => `${ligne.mois_annee} / ${ligne.produit_name || ligne.produit_programme_niveau_id}`;

    // Both inserts — saveRapportFsLigne and the CMM pass — copy the row's unit
    // onto the line, and the configuration does not change across the series.
    check(
        results,
        "chaque ligne est déclarée dans l'unité de sa liaison",
        lignes
            .filter((ligne) => ligne.produit_unit !== ligne.report_unit || ligne.produit_unit_id !== ligne.report_unit_id)
            .map((ligne) => `${label(ligne)} : ${ligne.produit_unit} (${ligne.produit_unit_id}) au lieu de ` +
                `${ligne.report_unit} (${ligne.report_unit_id})`),
    );

    check(
        results,
        "toutes les lignes portent sur un produit collecté par cette FS",
        lignes
            .filter((ligne) => !actualSet.has(ligne.produit_programme_niveau_id))
            .map((ligne) => label(ligne)),
    );

    const stockErrors = [];
    const ecartErrors = [];
    const sduErrors = [];
    const msdErrors = [];
    const situationErrors = [];
    const boundErrors = [];
    const detailErrors = [];

    for (const ligne of lignes) {
        // A line the CMM pass created on its own carries nothing but cmm/cmma;
        // there are no figures on it yet to check.
        if (ligne.qte_dispo_deb_mois === null && ligne.qte_dist_patient === null) continue;

        const expectedStock = stockTheorique(ligne);
        if (ligne.stock_theorique !== expectedStock) {
            stockErrors.push(`${label(ligne)} : ${ligne.stock_theorique} au lieu de ${expectedStock}`);
        }

        const lots = detailsByLigne.get(ligne.id) ?? [];
        const expectedSdu = lots.length === 0 ? null : lots.reduce((sum, lot) => sum + lot.sdu, 0);
        if (ligne.sdu_fin_mois !== expectedSdu) {
            sduErrors.push(`${label(ligne)} : ${ligne.sdu_fin_mois} au lieu de ${expectedSdu}`);
        }
        for (const lot of lots) {
            // The form disables the péremption field for a zero lot and requires
            // it for any other, so those two states are the only valid ones.
            if (lot.sdu === 0 && lot.date_peremption !== null) {
                detailErrors.push(`${label(ligne)} : SDU à 0 avec une date de péremption`);
            }
            if (lot.sdu !== 0 && !lot.date_peremption) {
                detailErrors.push(`${label(ligne)} : SDU non nul sans date de péremption`);
            }
        }

        const expectedEcart = computeEcart(ligne.sdu_fin_mois, expectedStock);
        if (ligne.ecart !== expectedEcart) {
            ecartErrors.push(`${label(ligne)} : ${ligne.ecart} au lieu de ${expectedEcart}`);
        }

        const expectedMsd = computeMsd(ligne.sdu_fin_mois, ligne.cmm);
        if (ligne.msd !== expectedMsd) {
            msdErrors.push(`${label(ligne)} : ${ligne.msd} au lieu de ${expectedMsd}`);
        }

        const expectedSituation = situationFor(ligne.sdu_fin_mois, ligne.msd);
        if (ligne.situation !== expectedSituation) {
            situationErrors.push(`${label(ligne)} : "${ligne.situation}" au lieu de "${expectedSituation}"`);
        }

        const available = (ligne.qte_dispo_deb_mois ?? 0) + (ligne.qte_rec_mois ?? 0);
        if ((ligne.qte_dist_patient ?? 0) > available) {
            boundErrors.push(`${label(ligne)} : distribué ${ligne.qte_dist_patient} > disponible ${available}`);
        }
        if (expectedStock < 0) {
            boundErrors.push(`${label(ligne)} : stock théorique négatif (${expectedStock})`);
        }
        const days = daysInMonth(parseMonthKey(ligne.mois_annee));
        if (ligne.nb_jour_rupture !== null && (ligne.nb_jour_rupture < 0 || ligne.nb_jour_rupture > days)) {
            boundErrors.push(`${label(ligne)} : ${ligne.nb_jour_rupture} jours de rupture pour ${days} jours`);
        }
        const noMovement = ["qte_dispo_deb_mois", "qte_rec_mois", "qte_dist_patient",
            "qte_perime_avarie_mois", "qte_redepl_mois"].every((field) => (ligne[field] ?? 0) === 0);
        if (noMovement && (ligne.nb_jour_rupture ?? 0) < 1) {
            boundErrors.push(`${label(ligne)} : aucun mouvement mais aucun jour de rupture`);
        }
    }

    check(results, "stock théorique = début + reçu − redéployé − distribué − périmé", stockErrors);
    check(results, "SDU fin de mois = somme des détails SDU", sduErrors);
    check(results, "détails SDU : date de péremption présente si et seulement si SDU non nul", detailErrors);
    check(results, "écart = SDU fin de mois − stock théorique", ecartErrors);
    check(results, "MSD = SDU / CMM", msdErrors);
    check(results, "situation cohérente avec le MSD", situationErrors);
    check(results, "quantités et jours de rupture dans leurs bornes", boundErrors);

    // ── Chains that run across months ────────────────────────────────────────
    const byPpn = new Map();
    for (const ligne of lignes) {
        const key = monthKey(parseMonthKey(ligne.mois_annee));
        const perMonth = byPpn.get(ligne.produit_programme_niveau_id) ?? new Map();
        perMonth.set(key, ligne);
        byPpn.set(ligne.produit_programme_niveau_id, perMonth);
    }

    const carryErrors = [];
    const cmmErrors = [];
    for (const [ppnId, perMonth] of byPpn) {
        for (const [key, ligne] of perMonth) {
            const ym = parseMonthKey(key);
            const previous = perMonth.get(monthKey(shiftMonths(ym, -1)));

            // A month opens on what the month before it closed on — the invariant
            // propagateQteDispoDebMois exists to maintain.
            if (previous && previous.sdu_fin_mois !== null && ligne.qte_dispo_deb_mois !== null) {
                if (ligne.qte_dispo_deb_mois !== previous.sdu_fin_mois) {
                    carryErrors.push(
                        `${key} / ${ligne.produit_name || ppnId} : ouverture ${ligne.qte_dispo_deb_mois}, ` +
                        `clôture précédente ${previous.sdu_fin_mois}`,
                    );
                }
            }

            // Where three consecutive reported months precede this one, the CMM
            // is their mean and is not the reporter's own figure any more.
            const history = [-3, -2, -1].map((offset) => perMonth.get(monthKey(shiftMonths(ym, offset))) ?? null);
            const expected = rollingCmm(history);
            if (!expected) continue;
            if (ligne.cmm !== expected.cmm) {
                cmmErrors.push(`${key} / ${ligne.produit_name || ppnId} : CMM ${ligne.cmm} au lieu de ${expected.cmm}`);
            }
            const sameCmma =
                expected.cmma === null
                    ? ligne.cmma === null
                    : ligne.cmma !== null && Math.abs(ligne.cmma - expected.cmma) < 1e-6;
            if (!sameCmma) {
                cmmErrors.push(`${key} / ${ligne.produit_name || ppnId} : CMMA ${ligne.cmma} au lieu de ${expected.cmma}`);
            }
        }
    }
    check(results, "stock d'ouverture repris de la clôture du mois précédent", carryErrors);
    check(results, "CMM/CMMA calculés sur les 3 mois précédents", cmmErrors);

    // ── Status ───────────────────────────────────────────────────────────────
    // Same rule as refreshRapportFsStatus (reportListsPpn): over the produits the
    // report shows — still collected and not unchecked (ppn_exclusion), or otherwise
    // where the report holds figures for them.
    const statusErrors = [];
    for (const rapport of rapports) {
        const rows = all(
            `SELECT l.id AS ligne_id, l.qte_dispo_deb_mois, l.qte_rec_mois, l.qte_dist_patient,
                    l.qte_perime_avarie_mois, l.qte_redepl_mois, l.nb_jour_rupture, l.sdu_fin_mois, l.cmm
             FROM my_produitprogrammeniveau mppn
                      LEFT JOIN rapportfs_ligne l
                                ON l.produit_programme_niveau_id = mppn.id AND l.rapportfs_id = ?
             WHERE (mppn.active = 1
                 AND NOT EXISTS (SELECT 1 FROM ppn_exclusion x WHERE x.ppn_id = mppn.id AND x.fs_id = ${fs}))
                OR (l.id IS NOT NULL
                 AND COALESCE(l.qte_dispo_deb_mois, l.qte_rec_mois, l.qte_dist_patient, l.qte_perime_avarie_mois,
                              l.qte_redepl_mois, l.nb_jour_rupture, l.sdu_fin_mois) IS NOT NULL)`,
            [rapport.id],
        );
        const complete = rows.every((row) => row.ligne_id !== null && isLigneComplete(row));
        if (Boolean(rapport.status) !== complete) {
            statusErrors.push(
                `${rapport.mois_annee} : statut ${rapport.status}, complétude calculée ${complete ? 1 : 0}`,
            );
        }
    }
    check(results, "statut de chaque rapport conforme à sa complétude", statusErrors);

    return results;
}

export function reportResults(results, log = console.log) {
    let failed = 0;
    for (const result of results) {
        if (result.failures.length === 0) {
            log(`  ok    ${result.name}`);
            continue;
        }
        failed += 1;
        log(`  ÉCHEC ${result.name} — ${result.failures.length} cas`);
        for (const failure of result.failures.slice(0, MAX_REPORTED_FAILURES)) {
            log(`          ${failure}`);
        }
        if (result.failures.length > MAX_REPORTED_FAILURES) {
            log(`          … et ${result.failures.length - MAX_REPORTED_FAILURES} autre(s)`);
        }
    }
    return failed;
}
