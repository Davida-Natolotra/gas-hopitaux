import {getDb} from "../../../services/db.ts";
import {generateUuid} from "../../../services/id-service.ts";
import {getDeviceId} from "../../../services/device-service.ts";
import type {userFS} from "../models/user-interface.ts";

interface UserFsRow {
    id: string;
    username: string;
    poste: string;
    phone: string;
    device_id: string;
}

function toUserFs(row: UserFsRow): userFS {
    return {id: row.id, username: row.username, poste: row.poste, phone: row.phone, deviceId: row.device_id};
}

// In practice there is exactly one profile per device install (see
// migration 0005's comment), so this just returns that single row if any.
export async function getUserProfile(): Promise<userFS | null> {
    const db = await getDb();
    const rows = await db.select<UserFsRow[]>("SELECT id, username, poste, phone, device_id FROM user_fs LIMIT 1");
    const row = rows[0];
    return row ? toUserFs(row) : null;
}

export interface SaveUserProfileInput {
    id: string | null;
    username: string;
    poste: string;
    phone: string;
}

// Creates the profile on first save (generating its id and stamping this
// device's own unchangeable id onto it), or updates it in place thereafter.
export async function saveUserProfile(input: SaveUserProfileInput): Promise<userFS> {
    const db = await getDb();
    const deviceId = await getDeviceId();
    const id = input.id ?? generateUuid();

    await db.execute(
        `INSERT INTO user_fs (id, username, poste, phone, device_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET
             username  = excluded.username,
             poste     = excluded.poste,
             phone     = excluded.phone,
             device_id = excluded.device_id`,
        [id, input.username, input.poste, input.phone, deviceId],
    );

    return {id, username: input.username, poste: input.poste, phone: input.phone, deviceId};
}
