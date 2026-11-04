mod backups;
mod commands;
pub mod db;
mod export;
mod opened_files;
mod updates;

use std::path::PathBuf;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // First, so a second launch (double-clicking a .kerfjob while the app is
        // open) hands its file to this window instead of opening another.
        .plugin(tauri_plugin_single_instance::init(opened_files::on_second_instance))
        // Restores the main window's size and position, saved on close.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Save, open and folder dialogs, opened from Rust only (export.rs, backups.rs).
        .plugin(tauri_plugin_dialog::init())
        // Release builds check for updates once a day; see updates.rs.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let backups = backups::BackupState::load(app_paths(app.handle()));
            let updates = updates::UpdateState::load(&backups.paths.data_dir, &app.package_info().version.to_string());
            let database = open_database(&backups, updates.updated_from());
            let opened = opened_files::OpenedFiles::default();
            if !updates.ignore_file_args() {
                let cwd = std::env::current_dir().unwrap_or_default();
                opened.set(opened_files::job_file_arg(std::env::args(), &cwd));
            }
            app.manage(commands::DbState::new(database));
            app.manage(backups);
            app.manage(updates);
            app.manage(opened);
            updates::start(app.handle());
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
            commands::save_job_layouts,
            commands::dev_load_sample_jobs,
            commands::add_example_job,
            commands::list_materials,
            commands::save_material,
            commands::delete_material,
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
            opened_files::take_opened_job_file,
            updates::update_status,
            updates::check_for_updates,
            updates::restart_to_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while starting KERFuffle");
    app.run(|app, event| {
        // The close guard has already flushed autosave by the time the app exits.
        if let tauri::RunEvent::Exit = event {
            updates::install_on_exit(app);
        }
    });
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

/// Open the job database, backing it up first if it needs upgrading. The first
/// start after an update always takes a backup, migration or not. A failure
/// here doesn't stop the window opening: every command reports it.
fn open_database(backups: &backups::BackupState, updated_from: Option<&str>) -> db::DbResult<rusqlite::Connection> {
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
    } else if let Some(previous) = updated_from {
        match db::backup::create_and_rotate(&conn, &backups.policy()) {
            Ok(backup) => eprintln!("KERFuffle: updated from {previous}; backed up the jobs as {}", backup.file_name),
            Err(error) => eprintln!("KERFuffle: updated from {previous}, but the backup failed: {error}"),
        }
    }
    Ok(conn)
}
