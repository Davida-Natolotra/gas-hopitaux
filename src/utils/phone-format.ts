// Local phone numbers are stored as raw 10-digit strings (e.g. "0341234567")
// and only ever formatted for display as "03x xx xxx xx" — the spaces are
// for readability and are never persisted.
const GROUP_LENGTHS = [3, 2, 3, 2];
export const PHONE_DIGIT_LENGTH = 10;

export function stripPhoneFormatting(value: string): string {
    return value.replace(/\D/g, "").slice(0, PHONE_DIGIT_LENGTH);
}

export function formatPhoneDisplay(value: string): string {
    const digits = stripPhoneFormatting(value);
    const groups: string[] = [];
    let offset = 0;
    for (const length of GROUP_LENGTHS) {
        if (offset >= digits.length) break;
        groups.push(digits.slice(offset, offset + length));
        offset += length;
    }
    return groups.join(" ");
}

export function isValidPhone(digits: string): boolean {
    return /^0\d{9}$/.test(digits);
}
