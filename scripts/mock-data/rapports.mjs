// The reported half of the mock dataset: one rapportfs per month for the saved
// FS, a rapportfs_ligne per applicable produit, and the Détails SDU each closing
// stock is summed from.
//
// The figures are not independent noise. A month's opening stock is the previous
// month's closing stock, CMM is the mean of the three months before it, and MSD
// (and so the situation label) falls out of the two — so a dataset made of
// random numbers would contradict itself on every screen that recomputes
// anything. What follows works backwards instead: each produit is given a
// consumption level and a stock profile (how many months of stock it should be
// carrying), and the receipts are whatever it takes to land there.

import {makeUuidFactory, makeRng, chance, randFloat, randInt, weighted} from "./random.mjs";
import {formatMoisAnnee, isoAt, monthKey, shiftMonths} from "./months.mjs";
import {
    ecart as computeEcart,
    isLigneComplete,
    msd as computeMsd,
    rollingCmm,
    situationFor,
    sduFinMois,
    stockTheorique,
} from "./formulas.mjs";

// How much stock a produit should be sitting on, expressed in months of
// consumption — i.e. straight into the MSD bands the situation label reads
// (>4 SURSTOCK, >=2 NORMAL, >0 SOUS STOCK, else RUPTURE). Weighted so a
// generated dataset has a believable majority of healthy produits while still
// giving the Alertes page something to show.
const PROFILE_WEIGHTS = [
    ["normal", 55],
    ["sousStock", 20],
    ["surstock", 15],
    ["rupture", 10],
];

// A produit in difficulty got there over time: the sousStock and rupture
// profiles report healthy months first and only degrade near the end of the
// series, which is what makes the trend visible across the months rather than a
// flat line of alarm.
function targetMonthsOfStock(rng, profile, index, lastIndex) {
    switch (profile) {
        case "surstock":
            return randFloat(rng, 4.6, 7.5);
        case "sousStock":
            return index >= lastIndex - 2 ? randFloat(rng, 0.4, 1.7) : randFloat(rng, 2.2, 3.5);
        case "rupture":
            return index >= lastIndex - 1 ? 0 : randFloat(rng, 2.0, 3.2);
        default:
            return randFloat(rng, 2.2, 3.8);
    }
}

function observationFor(rng, {ecart, situation}) {
    if (ecart !== null && ecart !== 0) {
        return "Écart constaté à l'inventaire physique, régularisation en cours.";
    }
    if (situation === "RUPTURE" && chance(rng, 0.8)) {
        return "Rupture constatée, commande d'urgence transmise au district.";
    }
    if (situation === "SOUS STOCK" && chance(rng, 0.5)) {
        return "Stock sous le seuil, réapprovisionnement demandé.";
    }
    if (situation === "SURSTOCK" && chance(rng, 0.4)) {
        return "Surstock lié à une dotation exceptionnelle.";
    }
    return "";
}

/** Splits a closing stock into 1-3 lots with their own péremption months. */
function buildDetailSdu(rng, uuidFor, {monthYm, ppnId, key, sdu}) {
    // Nothing on the shelf still has to be *recorded* as nothing, or the line
    // reads as never counted. A zero lot carries no expiry date — the edit form
    // disables the field for it (see isZeroSdu in rapport-programme-table.tsx).
    if (sdu === 0) {
        return [{id: uuidFor(`sdu:${key}:${ppnId}:0`), sdu: 0, date_peremption: null}];
    }

    const lots = sdu < 20 ? 1 : randInt(rng, 1, 3);
    const amounts = [];
    let left = sdu;
    for (let i = 0; i < lots - 1; i += 1) {
        // Leave at least one unit for each remaining lot.
        const max = left - (lots - 1 - i);
        const amount = randInt(rng, 1, Math.max(1, Math.floor(max / (lots - i))));
        amounts.push(amount);
        left -= amount;
    }
    amounts.push(left);

    return amounts.map((amount, i) => ({
        id: uuidFor(`sdu:${key}:${ppnId}:${i}`),
        sdu: amount,
        // Stored as "YYYY-MM": the détail form is an <input type="month">.
        date_peremption: monthKey(shiftMonths(monthYm, randInt(rng, 4, 30))),
    }));
}

/**
 * Generates every rapportfs, rapportfs_ligne and detail_sdu row.
 *
 * `months` is the consecutive series, oldest first. `partialLast` leaves part of
 * the newest month unfilled, the state a report actually being worked on is in.
 */
export function buildRapports({catalogue, seed, months, partialLast}) {
    const uuidFor = makeUuidFactory(seed);
    const rng = makeRng(seed ^ 0x5eed);

    const lastIndex = months.length - 1;
    const archiveIndex = months.findIndex((month) => month.key === monthKey(catalogue.archiveMonth));

    // One consumption level and one profile per produit, held for the whole
    // series so a produit behaves like itself from month to month.
    const profiles = new Map();
    for (const ppn of catalogue.myPpn) {
        profiles.set(ppn.id, {
            // Rounded to a multiple of 5: real consumption figures are not
            // seven-digit-precise, and it keeps the derived CMM readable.
            conso: randInt(rng, 6, 160) * 5,
            profile: weighted(rng, PROFILE_WEIGHTS),
        });
    }

    // The produits left out of the newest month, so it reads as half-entered.
    const skippedInLastMonth = new Set();
    if (partialLast) {
        for (const ppn of catalogue.myPpn) {
            if (chance(rng, 0.3)) skippedInLastMonth.add(ppn.id);
        }
    }

    const rapports = [];
    const lignes = [];
    const detailSdu = [];
    // ppnId -> month index -> the line generated for it, for the opening-stock
    // carry-over and the rolling CMM.
    const byPpn = new Map(catalogue.myPpn.map((ppn) => [ppn.id, new Map()]));

    months.forEach((month, index) => {
        const rapportId = uuidFor(`rapportfs:${month.key}`);
        const nextMonth = shiftMonths(month, 1);
        const createdDay = randInt(rng, 2, 6);

        rapports.push({
            id: rapportId,
            name: `Rapport ${catalogue.myFs.name} - ${formatMoisAnnee(month)}`,
            // A month's report is filled in early the month after it.
            created: isoAt(nextMonth, createdDay),
            // Everything but the two most recent months has already been sent.
            exported_date: index <= lastIndex - 2 ? isoAt(nextMonth, createdDay + randInt(rng, 1, 4), 16) : null,
            status: 0, // recomputed below, once the lines exist
            mois_annee: month.key,
            fs_id: catalogue.myFs.id,
            edited_by: catalogue.user.id,
            config_version: catalogue.configVersion,
        });

        for (const ppn of catalogue.myPpn) {
            const history = byPpn.get(ppn.id);
            const previous = history.get(index - 1) ?? null;
            const archived = catalogue.archivedPpnIds.has(ppn.id);
            const produit = catalogue.produitById.get(ppn.produit_id);
            const programme = catalogue.programmeById.get(ppn.programme_id);

            // What the three months before this one hold for this produit, in
            // the order computeRollingCmm reads them.
            const priorThree = [index - 3, index - 2, index - 1].map((i) => history.get(i) ?? null);
            const rolling = rollingCmm(priorThree);

            // A produit withdrawn from the configuration stops being collected
            // the month after the withdrawal. It keeps its earlier lines — those
            // are what the archived-produit handling in the report view exists
            // for — and gets no more: computeRollingCmm writes a CMM only onto a
            // row still collected, or onto a line the report already has.
            if (archived && index > archiveIndex) continue;

            if (index === lastIndex && skippedInLastMonth.has(ppn.id)) continue;

            const {conso, profile} = profiles.get(ppn.id);

            // Before the fourth month there is nothing to average, so the CMM is
            // the figure the user types in themselves (the field is editable —
            // it only stops being theirs once computeRollingCmm overwrites it).
            const cmm = rolling
                ? rolling.cmm
                : Math.max(1, Math.round(conso * randFloat(rng, 0.9, 1.1)));
            const cmma = rolling ? rolling.cmma : null;

            const target = targetMonthsOfStock(rng, profile, index, lastIndex);
            const desiredClosing = Math.round(target * cmm);

            const opening = previous
                ? previous.sdu_fin_mois
                : Math.round(conso * randFloat(rng, 1.8, 3.2));

            let dist = Math.max(1, Math.round(conso * randFloat(rng, 0.8, 1.2)));
            let perime = chance(rng, 0.12) ? randInt(rng, 1, Math.max(1, Math.round(conso * 0.03))) : 0;
            let redepl = chance(rng, 0.1) ? randInt(rng, 1, Math.max(1, Math.round(conso * 0.05))) : 0;

            // Receipts are the balancing figure: whatever the month has to take
            // in to end on the stock the profile calls for. Rounded up to a
            // round number of units when there is one to deliver, since stock
            // arrives in packs — except when the produit is meant to end the
            // month empty, where rounding up would quietly refill it.
            const exactRecu = Math.max(0, desiredClosing + dist + perime + redepl - opening);
            const recu = desiredClosing > 0 && exactRecu > 0 ? Math.ceil(exactRecu / 10) * 10 : exactRecu;

            // Nothing can leave that was never there. The edit form enforces the
            // same ceiling on the distributed quantity (maxIsStockDisponible),
            // and a negative stock théorique is not a state the app can produce.
            let available = opening + recu;
            dist = Math.min(dist, available);
            available -= dist;
            perime = Math.min(perime, available);
            available -= perime;
            redepl = Math.min(redepl, available);

            const base = {
                qte_dispo_deb_mois: opening,
                qte_rec_mois: recu,
                qte_dist_patient: dist,
                qte_perime_avarie_mois: perime,
                qte_redepl_mois: redepl,
            };
            const stock = stockTheorique(base);

            // Most months the physical count agrees with the books; occasionally
            // it does not, which is the whole point of the Ecart column.
            const discrepancy =
                stock > 0 && chance(rng, 0.12)
                    ? randInt(rng, 1, Math.max(1, Math.round(conso * 0.02))) * (chance(rng, 0.5) ? 1 : -1)
                    : 0;
            const closing = Math.max(0, stock + discrepancy);

            const details = buildDetailSdu(rng, uuidFor, {
                monthYm: month,
                ppnId: ppn.id,
                key: month.key,
                sdu: closing,
            });
            const sdu = sduFinMois(details);

            // Days a produit was unavailable: certain when it ended the month
            // empty, plausible when it was running low. Capped at the length of
            // the month the report covers, as the form's maxIsDaysInMonth does.
            let rupture = 0;
            if (sdu === 0) rupture = randInt(rng, 2, Math.min(18, month.days));
            else if (target < 1) rupture = chance(rng, 0.5) ? randInt(rng, 1, Math.min(6, month.days)) : 0;
            // A month in which literally nothing moved cannot also be a month in
            // which the produit was available throughout (minWithoutMovement).
            const noMovement = opening === 0 && recu === 0 && dist === 0 && perime === 0 && redepl === 0;
            if (noMovement) rupture = Math.max(1, rupture);
            rupture = Math.min(rupture, month.days);

            const msdValue = computeMsd(sdu, cmm);
            const situation = situationFor(sdu, msdValue);
            const ecartValue = computeEcart(sdu, stock);

            const ligne = {
                id: uuidFor(`ligne:${month.key}:${ppn.id}`),
                rapportfs_id: rapportId,
                produit_programme_niveau_id: ppn.id,
                ...base,
                nb_jour_rupture: rupture,
                stock_theorique: stock,
                sdu_fin_mois: sdu,
                ecart: ecartValue,
                cmm,
                cmma,
                msd: msdValue,
                situation,
                observation: observationFor(rng, {ecart: ecartValue, situation}),
                // The labels as they stood when the line was written — the report
                // has to keep reading the way it was filled in, whatever the
                // configuration says later.
                produit_code: produit.code ?? "",
                produit_name: produit.name,
                // The unit this app reports the row in (report_unit), with its
                // server id: the server reads the quantities in it.
                produit_unit: ppn.report_unit,
                produit_unit_id: ppn.report_unit_id,
                programme_name: programme.name,
            };

            lignes.push(ligne);
            history.set(index, ligne);
            for (const detail of details) {
                detailSdu.push({...detail, rapportfs_ligne_id: ligne.id});
            }
        }
    });

    // status, by the rule refreshRapportFsStatus applies: every produit the
    // report shows — those still collected, and withdrawn ones only where it
    // already has a line — must have a line with all the mandatory fields on it.
    for (const rapport of rapports) {
        const linesById = new Map(
            lignes.filter((ligne) => ligne.rapportfs_id === rapport.id)
                .map((ligne) => [ligne.produit_programme_niveau_id, ligne]),
        );
        rapport.status = catalogue.myPpn
            .filter((ppn) => !catalogue.archivedPpnIds.has(ppn.id) || linesById.has(ppn.id))
            .every((ppn) => isLigneComplete(linesById.get(ppn.id))) ? 1 : 0;
    }

    return {rapports, lignes, detailSdu};
}
