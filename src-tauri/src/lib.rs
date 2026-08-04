use tauri_plugin_sql::{Migration, MigrationKind};

mod backup;
mod export_utglfs;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_rapportfs_table",
            sql: include_str!("../migrations/0001_create_rapportfs.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_reference_tables",
            sql: include_str!("../migrations/0002_create_reference_tables.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_rapportfs_ligne_and_my_ppn",
            sql: include_str!("../migrations/0003_create_rapportfs_ligne_and_my_ppn.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_cmma",
            sql: include_str!("../migrations/0004_add_cmma.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_device_and_user_fs",
            sql: include_str!("../migrations/0005_create_device_and_user_fs.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "drop_qte_dist_ac",
            sql: include_str!("../migrations/0006_drop_qte_dist_ac.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "config_versioning",
            sql: include_str!("../migrations/0007_config_versioning.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:rfs.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            backup::export_database,
            backup::import_database,
            export_utglfs::export_utglfs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
