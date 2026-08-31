// Month helpers, mirroring src/utils/mois-annee.ts so the generated
// mois_annee values and month arithmetic match what the app does with them.

export function parseMonthKey(value) {
    const [year, month] = value.split("-").map(Number);
    if (!year || !month || month < 1 || month > 12) {
        throw new Error(`Mois invalide : "${value}" (attendu AAAA-MM).`);
    }
    return {year, month};
}

export function monthKey({year, month}) {
    return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftMonths({year, month}, delta) {
    const total = year * 12 + (month - 1) + delta;
    return {year: Math.floor(total / 12), month: (total % 12) + 1};
}

/** 28, 29, 30 or 31 — day 0 of the next month is the last day of this one. */
export function daysInMonth({year, month}) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The calendar month before the current one, the natural reporting period. */
export function previousCalendarMonth(now = new Date()) {
    return shiftMonths({year: now.getUTCFullYear(), month: now.getUTCMonth() + 1}, -1);
}

/** `count` consecutive months ending at (and including) `anchor`, oldest first. */
export function monthSeries(anchor, count) {
    const months = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
        const ym = shiftMonths(anchor, -offset);
        months.push({...ym, key: monthKey(ym), days: daysInMonth(ym)});
    }
    return months;
}

/** "MM/YYYY", the fr-FR rendering formatMoisAnnee produces for a report name. */
export function formatMoisAnnee({year, month}) {
    return `${String(month).padStart(2, "0")}/${year}`;
}

/** An ISO timestamp inside the given month, for `created` / `exported_date`. */
export function isoAt({year, month}, day, hour = 9, minute = 30) {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, 0)).toISOString();
}
