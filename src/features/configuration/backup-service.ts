import {invoke} from "@tauri-apps/api/core";
import {confirm, open, save} from "@tauri-apps/plugin-dialog";
import {getDb} from "../../services/db.ts";

const BACKUP_FILTERS = [{name: "Sauvegarde RFS", extensions: ["rfsbak"]}];

/** Returns the destination path on success, or null if the user cancelled. */
export async function backupDatabase(): Promise<string | null> {
    const today = new Date().toISOString().slice(0, 10);
    const dest = await save({
        title: "Enregistrer la sauvegarde",
        defaultPath: `rfs-backup-${today}.rfsbak`,
        filters: BACKUP_FILTERS,
    });
    if (!dest) return null;

    // Flush the WAL into the main database file before copying it, so the
    // backup includes every committed write.
    const db = await getDb();
    await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    await invoke("export_database", {dest});
    return dest;
}

/** Returns true if a backup was restored (caller must prompt for a restart). */
export async function restoreDatabase(): Promise<boolean> {
    const ok = await confirm(
        "Cette opération remplacera toutes les données actuelles par celles de la sauvegarde. Continuer ?",
        {title: "Restaurer une sauvegarde", kind: "warning"},
    );
    if (!ok) return false;

    const source = await open({
        title: "Choisir une sauvegarde",
        filters: BACKUP_FILTERS,
        multiple: false,
    });
    if (!source || Array.isArray(source)) return false;

    // Close our connection pool first so the file below isn't overwritten
    // while this process still holds it open.
    const db = await getDb();
    await db.close();
    await invoke("import_database", {source});
    return true;
}
