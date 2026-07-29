// Shared helpers for rapportfs.mois_annee, which is stored as either
// "YYYY-MM" (from the <input type="month"> add-sheet) or "YYYY-MM-DD"
// (seed data / legacy rows) — see date-format.ts for the same tolerance.

export interface YearMonth {
    year: number;
    month: number; // 1-12
}

export function parseMoisAnnee(value: string | null): YearMonth | null {
    if (!value) return null;
    const [yearPart, monthPart] = value.split("-");
    const year = Number(yearPart);
    const month = Number(monthPart);
    if (!year || !month) return null;
    return {year, month};
}

export function monthKey({year, month}: YearMonth): string {
    return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftMonths({year, month}: YearMonth, delta: number): YearMonth {
    const total = year * 12 + (month - 1) + delta;
    return {year: Math.floor(total / 12), month: (total % 12) + 1};
}
