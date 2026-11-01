//! Backup, restore and job-transfer commands. The TypeScript side is
//! app/src/data/client.ts.
//!
//! The backup folder and how many backups to keep live in
//! `%APPDATA%\KERFuffle\backup-settings.json`, not in the database, so
//! restoring an old backup never moves the backup folder.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::commands::DbState;
use crate::db::backup::{self, BackupInfo, Restored, DEFAULT_KEEP, MAX_KEEP};
use crate::db::{self, BackupPolicy, DbError, DbResult, ImportJob, ImportMode, Job};

const SETTINGS_FILE: &str = "backup-settings.json";
/// A job file is a few kilobytes; anything this big isn't one.
const MAX_JOB_FILE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettings {
    /// None: the default folder.
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default = "default_keep")]
    pub keep: u32,
}

fn default_keep() -> u32 {
    DEFAULT_KEEP
}

impl Default for BackupSettings {
    fn default() -> Self {
        Self { folder: None, keep: DEFAULT_KEEP }
    }
}

/// Fixed locations, worked out once at startup.
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    /// `Documents\KERFuffle\Backups`, or `%APPDATA%\KERFuffle\Backups` without a Documents folder.
    pub default_backup_dir: PathBuf,
}

pub struct BackupState {
    pub paths: AppPaths,
    settings: Mutex<BackupSettings>,
}

impl BackupState {
    /// Read the settings file; a missing or unreadable one means the defaults.
    pub fn load(paths: AppPaths) -> Self {
        let settings = std::fs::read_to_string(paths.data_dir.join(SETTINGS_FILE))
            .ok()
            .and_then(|text| serde_json::from_str::<BackupSettings>(&text).ok())
            .map(|s| BackupSettings { keep: s.keep.clamp(1, MAX_KEEP), ..s })
            .unwrap_or_default();
        Self { paths, settings: Mutex::new(settings) }
    }

    fn settings(&self) -> BackupSettings {
        self.settings.lock().map(|s| s.clone()).unwrap_or_default()
    }

    pub fn policy(&self) -> BackupPolicy {
        let settings = self.settings();
        BackupPolicy {
            dir: settings.folder.map(PathBuf::from).unwrap_or_else(|| self.paths.default_backup_dir.clone()),
            keep: settings.keep,
        }
    }

    fn save(&self, next: BackupSettings) -> DbResult<()> {
        let path = self.paths.data_dir.join(SETTINGS_FILE);
        let temp = self.paths.data_dir.join(format!("{SETTINGS_FILE}.tmp"));
        std::fs::create_dir_all(&self.paths.data_dir)?;
        std::fs::write(&temp, serde_json::to_string_pretty(&next).map_err(DbError::from)?)?;
        std::fs::rename(&temp, &path)?;
        if let Ok(mut settings) = self.settings.lock() {
            *settings = next;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupOverview {
    pub folder: String,
    pub default_folder: String,
    pub keep: u32,
    /// Newest first.
    pub backups: Vec<BackupInfo>,
}

fn overview(state: &BackupState) -> DbResult<BackupOverview> {
    let policy = state.policy();
    Ok(BackupOverview {
        folder: policy.dir.to_string_lossy().into_owned(),
        default_folder: state.paths.default_backup_dir.to_string_lossy().into_owned(),
        keep: policy.keep,
        backups: backup::list(&policy.dir)?,
    })
}

#[tauri::command]
pub async fn backup_overview(backups: State<'_, BackupState>) -> Result<BackupOverview, DbError> {
    overview(&backups)
}

#[tauri::command]
pub async fn back_up_now(db: State<'_, DbState>, backups: State<'_, BackupState>) -> Result<BackupInfo, DbError> {
    let policy = backups.policy();
    db.with(|conn| backup::create_and_rotate(conn, &policy))
}

/// Called once at startup. None when today's backup already exists or there are no jobs yet.
#[tauri::command]
pub async fn run_daily_backup(
    db: State<'_, DbState>,
    backups: State<'_, BackupState>,
) -> Result<Option<BackupInfo>, DbError> {
    let policy = backups.policy();
    db.with(|conn| backup::daily(conn, &policy))
}

#[tauri::command]
pub async fn restore_backup(
    db: State<'_, DbState>,
    backups: State<'_, BackupState>,
    file_name: String,
) -> Result<Restored, DbError> {
    let policy = backups.policy();
    db.with_slot(|slot| backup::restore(slot, &backups.paths.db_path, &policy, &file_name))
}

/// Check that a folder can hold backups: it exists (or can be made) and accepts a file.
fn check_folder(dir: &Path) -> DbResult<()> {
    let unusable = |error: std::io::Error| {
        DbError::invalid(format!("KERFuffle can't save backups in {} ({error}). Pick another folder.", dir.display()))
    };
    if !dir.is_absolute() {
        return Err(DbError::invalid("Pick a whole folder path, such as one on the C: drive."));
    }
    std::fs::create_dir_all(dir).map_err(unusable)?;
    let probe = dir.join(".kerfuffle-write-test");
    std::fs::write(&probe, b"ok").map_err(unusable)?;
    let _ = std::fs::remove_file(probe);
    Ok(())
}

/// Save the backup folder and count. Old backups stay where they are; the new
/// count applies from the next backup.
#[tauri::command]
pub async fn set_backup_settings(
    backups: State<'_, BackupState>,
    settings: BackupSettings,
) -> Result<BackupOverview, DbError> {
    if !(1..=MAX_KEEP).contains(&settings.keep) {
        return Err(DbError::invalid(format!("Keep between 1 and {MAX_KEEP} backups.")));
    }
    let folder = settings.folder.map(|f| f.trim().to_string()).filter(|f| !f.is_empty());
    let dir = folder.as_ref().map(PathBuf::from).unwrap_or_else(|| backups.paths.default_backup_dir.clone());
    check_folder(&dir)?;
    // The default folder is stored as "default", so it follows Documents if that moves.
    let folder = folder.filter(|f| Path::new(f) != backups.paths.default_backup_dir);
    backups.save(BackupSettings { folder, keep: settings.keep })?;
    overview(&backups)
}

/// Ask for a backup folder. None when the user cancels.
#[tauri::command]
pub async fn choose_backup_folder(app: AppHandle, backups: State<'_, BackupState>) -> Result<Option<String>, DbError> {
    let mut dialog = app.dialog().file().set_title("Choose the backup folder");
    let current = backups.policy().dir;
    if current.is_dir() {
        dialog = dialog.set_directory(current);
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    dialog.pick_folder(move |path| {
        let _ = tx.send(path);
    });
    let Some(picked) = rx.await.ok().flatten() else { return Ok(None) };
    let path = picked.into_path().map_err(|e| DbError::invalid(format!("That folder can't be used ({e}).")))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Open the backup folder in File Explorer (made first if needed).
#[tauri::command]
pub async fn open_backup_folder(backups: State<'_, BackupState>) -> Result<(), DbError> {
    let dir = backups.policy().dir;
    std::fs::create_dir_all(&dir)?;
    std::process::Command::new("explorer.exe")
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| DbError::Storage(format!("File Explorer couldn't be opened ({e})")))
}

// ---------------------------------------------------------------------------
// Job files
// ---------------------------------------------------------------------------

/// Ask for a `.kerfjob` file. None when the user cancels.
#[tauri::command]
pub async fn choose_job_file(app: AppHandle) -> Result<Option<String>, DbError> {
    let mut dialog = app.dialog().file().set_title("Import a job file").add_filter("KERFuffle job", &["kerfjob"]);
    if let Ok(documents) = tauri::Manager::path(&app).document_dir() {
        let dir = documents.join("KERFuffle");
        dialog = dialog.set_directory(if dir.is_dir() { dir } else { documents });
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    dialog.pick_file(move |path| {
        let _ = tx.send(path);
    });
    let Some(picked) = rx.await.ok().flatten() else { return Ok(None) };
    let path = picked.into_path().map_err(|e| DbError::invalid(format!("That file can't be opened ({e}).")))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// The text of a `.kerfjob` file the user picked or dropped. Only that kind of
/// file is read, and only up to a size no job file reaches.
#[tauri::command]
pub async fn read_job_file(path: String) -> Result<String, DbError> {
    read_job_text(Path::new(&path))
}

fn read_job_text(path: &Path) -> DbResult<String> {
    let is_job_file = path.extension().is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case("kerfjob"));
    if !is_job_file {
        return Err(DbError::invalid("Only KERFuffle job files (.kerfjob) can be imported."));
    }
    let size = std::fs::metadata(path)
        .map_err(|e| DbError::invalid(format!("The file couldn't be opened ({e}).")))?
        .len();
    if size > MAX_JOB_FILE_BYTES {
        return Err(DbError::invalid("That file is too big to be a KERFuffle job file."));
    }
    let bytes = std::fs::read(path).map_err(|e| DbError::invalid(format!("The file couldn't be read ({e}).")))?;
    let text = String::from_utf8(bytes)
        .map_err(|_| DbError::invalid("That file isn't a KERFuffle job file, or it has been damaged."))?;
    Ok(text.strip_prefix('\u{feff}').map(str::to_string).unwrap_or(text))
}

/// Store a validated job. Replacing a job backs up all jobs first; if that
/// backup fails, nothing is replaced.
#[tauri::command]
pub async fn import_job(
    db: State<'_, DbState>,
    backups: State<'_, BackupState>,
    job: ImportJob,
    mode: ImportMode,
) -> Result<Job, DbError> {
    let policy = backups.policy();
    db.with(|conn| {
        if mode == ImportMode::Replace {
            backup::create_and_rotate(conn, &policy)?;
        }
        db::import_job(conn, &job, mode)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_only_job_files_and_drops_a_byte_order_mark() {
        let dir = tempfile::tempdir().unwrap();
        let job = dir.path().join("Kitchen (J-0014).KERFJOB");
        std::fs::write(&job, "\u{feff}{\"format\":\"kerfuffle-job\"}").unwrap();
        assert_eq!(read_job_text(&job).unwrap(), "{\"format\":\"kerfuffle-job\"}");

        let other = dir.path().join("notes.txt");
        std::fs::write(&other, "hello").unwrap();
        assert_eq!(read_job_text(&other).unwrap_err().kind(), "invalid");

        let binary = dir.path().join("photo.kerfjob");
        std::fs::write(&binary, [0xff, 0xd8, 0xff, 0x00]).unwrap();
        assert_eq!(read_job_text(&binary).unwrap_err().kind(), "invalid");
    }

    #[test]
    fn settings_load_with_defaults_and_save_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let paths = || AppPaths {
            data_dir: dir.path().to_path_buf(),
            db_path: dir.path().join("kerfuffle.db"),
            default_backup_dir: dir.path().join("Backups"),
        };
        let state = BackupState::load(paths());
        assert_eq!(state.policy(), BackupPolicy { dir: dir.path().join("Backups"), keep: DEFAULT_KEEP });

        let elsewhere = dir.path().join("USB").to_string_lossy().into_owned();
        state.save(BackupSettings { folder: Some(elsewhere.clone()), keep: 30 }).unwrap();
        let reloaded = BackupState::load(paths());
        assert_eq!(reloaded.policy(), BackupPolicy { dir: PathBuf::from(elsewhere), keep: 30 });

        std::fs::write(dir.path().join(SETTINGS_FILE), "not json").unwrap();
        assert_eq!(BackupState::load(paths()).policy().keep, DEFAULT_KEEP);
    }
}
