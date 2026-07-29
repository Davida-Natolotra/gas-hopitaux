// Single source of truth for generating string ids across the app, so every
// call site uses the same underlying uuid function instead of calling
// crypto.randomUUID() ad hoc.
export function generateUuid(): string {
    return crypto.randomUUID();
}
