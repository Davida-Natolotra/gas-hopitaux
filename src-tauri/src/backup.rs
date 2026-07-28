use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const DB_FILE_NAME: &str = "rfs.db";

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(DB_FILE_NAME))
        .map_err(|e| e.to_string())
}

/// Copy the local SQLite database file to `dest`, for backup export.
/// The caller must run `PRAGMA wal_checkpoint(TRUNCATE)` on the live sql
/// plugin connection beforehand, so pending WAL writes are flushed into the
/// main database file before it is copied.
#[tauri::command]
pub fn export_database(dest: String, app: AppHandle) -> Result<(), String> {
    let source = db_path(&app)?;
    fs::copy(&source, &dest).map_err(|e| format!("Échec de la sauvegarde : {e}"))?;
    Ok(())
}

/// Overwrite the local SQLite database file with the contents of `source`,
/// for backup restore. The caller must close the active sql plugin
/// connection first (so this process doesn't hold a lock on the file being
/// replaced), and the app must be restarted afterwards for the restored
/// data to take effect.
#[tauri::command]
pub fn import_database(source: String, app: AppHandle) -> Result<(), String> {
    let dest = db_path(&app)?;
    let dir = dest.parent().ok_or("Chemin de base de données invalide")?;
    for name in ["rfs.db-wal", "rfs.db-shm"] {
        let _ = fs::remove_file(dir.join(name));
    }
    fs::copy(&source, &dest).map_err(|e| format!("Échec de la restauration : {e}"))?;
    Ok(())
}
