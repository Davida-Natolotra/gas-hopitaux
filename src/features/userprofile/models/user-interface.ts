export interface userFS {
    id: string
    username: string
    poste: string
    // Raw 10-digit local number (e.g. "0341234567"), no formatting spaces —
    // those are display-only (see phone-format.ts). Kept as a string since a
    // leading "0" is significant and this value is never used arithmetically.
    phone: string
    deviceId: string
}
