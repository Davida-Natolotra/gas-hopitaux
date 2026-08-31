import Database from "@tauri-apps/plugin-sql";

// `npm run dev:mock` (scripts/dev-mock.mjs) sets VITE_MOCK_DB=1 and seeds a
// throwaway rfs-dev.db next to the real one, then deletes it when the session
// ends. Pointing the app at it here is what keeps mock data out of rfs.db —
// and the variable only ever exists in that launcher, so a normal `tauri dev`
// or a production build always opens the real database.
const DB_URL = import.meta.env.VITE_MOCK_DB === "1" ? "sqlite:rfs-dev.db" : "sqlite:rfs.db";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
    if (!dbPromise) {
        dbPromise = Database.load(DB_URL).catch((err) => {
            dbPromise = null;
            throw err;
        });
    }
    return dbPromise;
}
