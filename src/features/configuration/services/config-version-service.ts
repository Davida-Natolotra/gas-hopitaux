import {getDb} from "../../../services/db.ts";

/**
 * Which configuration this device is running, and how reports are stamped with it.
 *
 * A report has to record the configuration it was filled in against, not the one
 * that happens to be installed when someone later looks at it. Otherwise there is
 * no way to tell a report that is genuinely missing a produit from one captured
 * before that produit was ever offered — the server judges completeness against
 * the version the report declares, and this is where that number comes from.
 */

export interface DeviceConfigVersion {
    version: number;
    schema: number;
    publishedAt: string | null;
    checksum: string | null;
    importedAt: string;
}

interface ConfigVersionRow {
    version: number;
    schema: number;
    published_at: string | null;
    checksum: string | null;
    imported_at: string;
}

export async function getConfigVersion(): Promise<DeviceConfigVersion | null> {
    const db = await getDb();
    const rows = await db.select<ConfigVersionRow[]>(
        `SELECT version, schema, published_at, checksum, imported_at
         FROM config_version
         WHERE id = 1`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
        version: row.version,
        schema: row.schema,
        publishedAt: row.published_at,
        checksum: row.checksum,
        importedAt: row.imported_at,
    };
}

export async function setConfigVersion(input: {
    version: number;
    schema: number;
    publishedAt?: string | null;
    checksum?: string | null;
}): Promise<void> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO config_version (id, version, schema, published_at, checksum, imported_at)
         VALUES (1, $1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET version      = excluded.version,
                                       schema       = excluded.schema,
                                       published_at = excluded.published_at,
                                       checksum     = excluded.checksum,
                                       imported_at  = excluded.imported_at`,
        [input.version, input.schema, input.publishedAt ?? null, input.checksum ?? null,
            new Date().toISOString()],
    );
}

/**
 * Stamps a report with the configuration currently installed.
 *
 * Called when the report is created and again when it is exported, because a
 * configuration can arrive between the two: what matters is the version the
 * figures were actually entered against, and re-stamping on export keeps that
 * honest for a report still being edited. A report already sent stays as it was.
 */
export async function stampReportWithConfigVersion(rapportfsId: string): Promise<number | null> {
    const current = await getConfigVersion();
    if (!current) return null;

    const db = await getDb();
    await db.execute(
        `UPDATE rapportfs
         SET config_version = $1
         WHERE id = $2`,
        [current.version, rapportfsId],
    );
    return current.version;
}
