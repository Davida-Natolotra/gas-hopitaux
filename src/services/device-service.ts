import {getDb} from "./db.ts";
import {generateUuid} from "./id-service.ts";

let deviceIdPromise: Promise<string> | null = null;

// This install's own unchangeable device id: generated once (first app
// start) and persisted in the singleton `device` table, then always read
// back afterward — it never changes for the lifetime of this install.
// Call this at app startup so the id exists before anything needs it (e.g.
// the user profile form); safe to call again anywhere since it's idempotent.
export function getDeviceId(): Promise<string> {
    if (!deviceIdPromise) {
        deviceIdPromise = (async () => {
            const db = await getDb();
            const rows = await db.select<{ device_id: string }[]>(
                "SELECT device_id FROM device WHERE id = 1",
            );
            if (rows[0]) return rows[0].device_id;

            const deviceId = generateUuid();
            await db.execute(
                `INSERT INTO device (id, device_id)
                 VALUES (1, $1)
                 ON CONFLICT(id) DO NOTHING`,
                [deviceId],
            );
            // Another concurrent call may have inserted first; re-read so
            // every caller converges on the same persisted value.
            const finalRows = await db.select<{ device_id: string }[]>(
                "SELECT device_id FROM device WHERE id = 1",
            );
            return finalRows[0].device_id;
        })();
    }
    return deviceIdPromise;
}
