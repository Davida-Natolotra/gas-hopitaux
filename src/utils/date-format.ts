// Dates from SQLite are plain "YYYY-MM-DD" (or "YYYY-MM-DDTHH:mm:ssZ") strings.
// We parse the components manually instead of `new Date(value)` so that a
// local timezone behind UTC can't roll the date back a day.
function parseIsoDate(value: string): Date {
    const [datePart] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day || 1));
}

export function formatMoisAnnee(value: string | null): string {
    if (!value) return "-";
    return new Intl.DateTimeFormat("fr-FR", {
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
    }).format(parseIsoDate(value));
}

export function formatDate(value: string | null): string {
    if (!value) return "-";
    return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
    }).format(parseIsoDate(value));
}
