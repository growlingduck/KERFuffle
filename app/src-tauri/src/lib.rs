mod backups;
mod commands;
pub mod db;
mod export;

use std::path::PathBuf;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Restores the main window's size and position, saved on close.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Save, open and folder dialogs, opened from Rust only (export.rs, backups.rs).
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let backups = backups::BackupState::load(app_paths(app.handle()));
            let database = open_database(&backups);
            app.manage(commands::DbState::new(database));
            app.manage(backups);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_jobs,
            commands::get_job,
            commands::create_job,
            commands::duplicate_job,
            commands::update_job_fields,
            commands::set_job_status,
            commands::delete_job,
            commands::save_job,
            commands::upsert_cabinet,
            commands::reorder_cabinets,
            commands::delete_cabinet,
            commands::write_pending_edit,
            commands::recover_pending_edits,
            commands::get_shop_settings,
            commands::set_shop_setting,
            commands::dev_load_sample_jobs,
            backups::backup_overview,
            backups::back_up_now,
            backups::run_daily_backup,
            backups::restore_backup,
            backups::set_backup_settings,
            backups::choose_backup_folder,
            backups::open_backup_folder,
            backups::choose_job_file,
            backups::read_job_file,
            backups::import_job,
            export::choose_export_path,
            export::write_export_file,
            export::print_to_pdf,
            export::show_print_dialog,
            export::reveal_in_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running KERFuffle");
}

/// The job database is `%APPDATA%\KERFuffle\kerfuffle.db`; backups go to
/// `Documents\KERFuffle\Backups` unless Settings names another folder.
fn app_paths(app: &tauri::AppHandle) -> backups::AppPaths {
    // Without a data folder the database can't open; open_database reports that.
    let data_dir = app.path().data_dir().map(|d| d.join("KERFuffle")).unwrap_or_else(|_| PathBuf::from("KERFuffle"));
    let default_backup_dir = app
        .path()
        .document_dir()
        .map(|d| d.join("KERFuffle").join("Backups"))
        .unwrap_or_else(|_| data_dir.join("Backups"));
    backups::AppPaths { db_path: data_dir.join(db::DB_FILE_NAME), data_dir, default_backup_dir }
}

/// Open the job database, backing it up first if it needs upgrading. A failure
/// here doesn't stop the window opening: every command reports it.
fn open_database(backups: &backups::BackupState) -> db::DbResult<rusqlite::Connection> {
    if !backups.paths.data_dir.is_absolute() {
        return Err(db::DbError::Unavailable("the data folder couldn't be found".into()));
    }
    let (conn, report) = db::open(&backups.paths.db_path, Some(&backups.policy()))?;
    if let Some(backup) = report.backup {
        eprintln!(
            "KERFuffle: upgraded the job database from schema {} to {}; backup at {}",
            report.from_version,
            report.to_version,
            backup.display()
        );
    }
    Ok(conn)
}
