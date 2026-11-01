//! Updates (prompt 08). A release build checks GitHub Releases at most once a
//! day (a little after start-up, then again while it stays open, so a shop PC
//! that never closes KERFuffle still hears about updates), and downloads a
//! newer version in the background. Nothing is installed while KERFuffle is open: the header says
//! "Update ready" and the installer runs when the app exits, or at once if the
//! user picks Restart now (the webview flushes autosave first). Offline, the
//! check fails quietly and the app works as usual.
//!
//! The download is checked against the updater public key in tauri.conf.json
//! before it is kept, so a tampered file is never installed. After the update,
//! the first start upgrades the job database with a backup first (db::open).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const STATE_FILE: &str = "update-state.json";
const CHECK_EVERY_SECS: u64 = 24 * 60 * 60;
/// Let the window, the daily backup and the job list go first.
const STARTUP_DELAY: Duration = Duration::from_secs(20);
/// How often a long-running app asks whether a check is due (check_due decides).
const RECHECK_EVERY: Duration = Duration::from_secs(60 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
/// After Restart now, the relaunched app ignores a .kerfjob in its arguments
/// (the updater passes the old ones on) if it starts within this long.
const RELAUNCH_WINDOW_SECS: u64 = 10 * 60;

/// After every check, found or not, so the webview can refresh its status.
pub const STATUS_EVENT: &str = "update-status";

/// What the app remembers between runs, in `%APPDATA%\KERFuffle\update-state.json`.
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Saved {
    /// Unix seconds of the last check that reached the server.
    last_check: Option<u64>,
    /// The version that last ran, to say "Updated to …" once.
    last_run_version: Option<String>,
    /// Unix seconds; see RELAUNCH_WINDOW_SECS.
    ignore_file_args_until: Option<u64>,
}

struct Ready {
    update: Update,
    bytes: Vec<u8>,
}

pub struct UpdateState {
    file: PathBuf,
    saved: Mutex<Saved>,
    ready: Mutex<Option<Ready>>,
    checking: AtomicBool,
    enabled: bool,
    current_version: String,
    /// Set at start-up when this run is the first one after an update.
    updated_from: Option<String>,
    ignore_file_args: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    current_version: String,
    /// False in development builds: they never update themselves.
    enabled: bool,
    checking: bool,
    /// The version downloaded and waiting to install, if any.
    ready_version: Option<String>,
    /// Unix milliseconds of the last check that reached the server.
    last_checked: Option<u64>,
    /// The version this one replaced, on the first run after an update.
    updated_from: Option<String>,
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Due if never checked, a day has passed, or the clock went backwards.
fn check_due(last_check: Option<u64>, now: u64) -> bool {
    match last_check {
        None => true,
        Some(last) => last > now || now - last >= CHECK_EVERY_SECS,
    }
}

fn read_saved(file: &Path) -> Saved {
    std::fs::read_to_string(file).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

fn write_saved(file: &Path, saved: &Saved) {
    let result = serde_json::to_string_pretty(saved)
        .map_err(std::io::Error::other)
        .and_then(|text| std::fs::write(file, text));
    if let Err(error) = result {
        eprintln!("KERFuffle: couldn't save {}: {error}", file.display());
    }
}

impl UpdateState {
    /// Read the saved state and note whether this run follows an update.
    pub fn load(data_dir: &Path, current_version: &str) -> Self {
        let file = data_dir.join(STATE_FILE);
        let mut saved = read_saved(&file);
        let now = now_secs();
        let updated_from = saved.last_run_version.clone().filter(|v| v != current_version);
        let ignore_file_args = saved.ignore_file_args_until.is_some_and(|until| now <= until);
        let changed = saved.last_run_version.as_deref() != Some(current_version) || saved.ignore_file_args_until.is_some();
        saved.last_run_version = Some(current_version.to_string());
        saved.ignore_file_args_until = None;
        // Not before the data folder is known: never write next to the program.
        if changed && data_dir.is_absolute() && std::fs::create_dir_all(data_dir).is_ok() {
            write_saved(&file, &saved);
        }
        // Development builds never update themselves. To try the update flow,
        // build a test release with a local feed (docs/release.md).
        let enabled = !cfg!(debug_assertions);
        Self {
            file,
            saved: Mutex::new(saved),
            ready: Mutex::new(None),
            checking: AtomicBool::new(false),
            enabled,
            current_version: current_version.to_string(),
            updated_from,
            ignore_file_args,
        }
    }

    /// The version this one replaced, on the first run after an update.
    pub fn updated_from(&self) -> Option<&str> {
        self.updated_from.as_deref()
    }

    /// True right after Restart now: the arguments are the old run's.
    pub fn ignore_file_args(&self) -> bool {
        self.ignore_file_args
    }

    fn status(&self) -> UpdateStatus {
        let saved = self.saved.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let ready = self.ready.lock().unwrap_or_else(|e| e.into_inner());
        UpdateStatus {
            current_version: self.current_version.clone(),
            enabled: self.enabled,
            checking: self.checking.load(Ordering::SeqCst),
            ready_version: ready.as_ref().map(|r| r.update.version.clone()),
            last_checked: saved.last_check.map(|s| s * 1000),
            updated_from: self.updated_from.clone(),
        }
    }

    fn has_ready(&self) -> bool {
        self.ready.lock().unwrap_or_else(|e| e.into_inner()).is_some()
    }

    fn take_ready(&self) -> Option<Ready> {
        self.ready.lock().unwrap_or_else(|e| e.into_inner()).take()
    }

    fn update_saved(&self, change: impl FnOnce(&mut Saved)) {
        let mut saved = self.saved.lock().unwrap_or_else(|e| e.into_inner());
        change(&mut saved);
        write_saved(&self.file, &saved);
    }
}

/// Check a little after start-up, then every hour while the app stays open.
/// Each check is skipped unless a day has passed since the last one that
/// reached the server, so offline PCs retry hourly and online ones daily.
pub fn start(app: &AppHandle) {
    if !app.state::<UpdateState>().enabled {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STARTUP_DELAY).await;
        loop {
            if let Err(message) = check(&app, false).await {
                eprintln!("KERFuffle: update check failed: {message}");
            }
            // One download per run: it installs when the app closes.
            if app.state::<UpdateState>().has_ready() {
                break;
            }
            tokio::time::sleep(RECHECK_EVERY).await;
        }
    });
}

/// Ask the server for a newer version and download it. `force` ignores the
/// once-a-day limit (Settings → About → Check for updates).
async fn check(app: &AppHandle, force: bool) -> Result<(), String> {
    let state = app.state::<UpdateState>();
    if !state.enabled || state.has_ready() {
        return Ok(());
    }
    let last_check = state.saved.lock().unwrap_or_else(|e| e.into_inner()).last_check;
    if !force && !check_due(last_check, now_secs()) {
        return Ok(());
    }
    if state.checking.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let result = check_and_download(app).await;
    // Store the result before clearing `checking`, so a status read in between
    // never sees "not checking, nothing ready" for an update that was found.
    let result = result.map(|found| {
        state.update_saved(|saved| saved.last_check = Some(now_secs()));
        if let Some(ready) = found {
            *state.ready.lock().unwrap_or_else(|e| e.into_inner()) = Some(ready);
        }
    });
    state.checking.store(false, Ordering::SeqCst);
    // Every check, found or not: a manual check that overlapped this one is
    // waiting to hear it finished.
    let _ = app.emit(STATUS_EVENT, ());
    result
}

async fn check_and_download(app: &AppHandle) -> Result<Option<Ready>, String> {
    let mut builder = app.updater_builder().timeout(REQUEST_TIMEOUT);
    // The installer ends the process; keep the window where the user left it.
    let handle = app.clone();
    builder = builder.on_before_exit(move || {
        let _ = handle.save_window_state(StateFlags::all());
    });
    let updater = builder.build().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    // download() checks the signature before returning the bytes.
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    Ok(Some(Ready { update, bytes }))
}

/// Run the downloaded installer, if any, and end the process. With `restart`,
/// the installer opens KERFuffle again when it's done.
fn install(state: &UpdateState, restart: bool) -> Result<(), String> {
    let Some(Ready { update, bytes }) = state.take_ready() else {
        return Err("No update is ready to install.".into());
    };
    if restart {
        state.update_saved(|saved| saved.ignore_file_args_until = Some(now_secs() + RELAUNCH_WINDOW_SECS));
    }
    let update = update.restart_after_install(restart);
    // On Windows a successful install() starts the installer and exits.
    let error = match update.install(&bytes) {
        Ok(()) => return Ok(()),
        Err(error) => error.to_string(),
    };
    if restart {
        state.update_saved(|saved| saved.ignore_file_args_until = None);
    }
    *state.ready.lock().unwrap_or_else(|e| e.into_inner()) = Some(Ready { update, bytes });
    Err(format!("The update couldn't start: {error}"))
}

/// Called as the app exits (after the close guard has flushed autosave).
pub fn install_on_exit(app: &AppHandle) {
    let state = app.state::<UpdateState>();
    if state.has_ready() {
        if let Err(message) = install(&state, false) {
            eprintln!("KERFuffle: {message}");
        }
    }
}

#[tauri::command]
pub fn update_status(state: tauri::State<'_, UpdateState>) -> UpdateStatus {
    state.status()
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateStatus, String> {
    let state = app.state::<UpdateState>();
    if !state.enabled {
        return Err("Development builds don’t update themselves.".into());
    }
    check(&app, true)
        .await
        .map_err(|_| "Couldn’t reach the update server. KERFuffle works normally offline; it will try again tomorrow.".to_string())?;
    Ok(state.status())
}

/// Restart now. The webview has flushed autosave before calling this.
#[tauri::command]
pub fn restart_to_update(state: tauri::State<'_, UpdateState>) -> Result<(), String> {
    install(&state, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_at_most_once_a_day() {
        let day = CHECK_EVERY_SECS;
        assert!(check_due(None, 1_000));
        assert!(!check_due(Some(1_000), 1_000));
        assert!(!check_due(Some(1_000), 1_000 + day - 1));
        assert!(check_due(Some(1_000), 1_000 + day));
        // A clock set back doesn't block checks forever.
        assert!(check_due(Some(1_000 + day * 3), 1_000));
    }

    #[test]
    fn notes_the_first_run_after_an_update_once() {
        let dir = tempfile::tempdir().unwrap();
        let first = UpdateState::load(dir.path(), "0.1.0");
        assert_eq!(first.updated_from, None);
        let same = UpdateState::load(dir.path(), "0.1.0");
        assert_eq!(same.updated_from, None);
        let updated = UpdateState::load(dir.path(), "0.2.0");
        assert_eq!(updated.updated_from.as_deref(), Some("0.1.0"));
        let again = UpdateState::load(dir.path(), "0.2.0");
        assert_eq!(again.updated_from, None);
    }

    #[test]
    fn ignores_file_args_only_just_after_restart_now() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(STATE_FILE);
        write_saved(&file, &Saved { ignore_file_args_until: Some(now_secs() + 60), ..Saved::default() });
        assert!(UpdateState::load(dir.path(), "0.2.0").ignore_file_args());
        // Cleared by that start, so the next one opens files again.
        assert!(!UpdateState::load(dir.path(), "0.2.0").ignore_file_args());

        write_saved(&file, &Saved { ignore_file_args_until: Some(now_secs().saturating_sub(1)), ..Saved::default() });
        assert!(!UpdateState::load(dir.path(), "0.2.0").ignore_file_args());
    }

    #[test]
    fn a_damaged_state_file_starts_fresh() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(STATE_FILE), "not json").unwrap();
        let state = UpdateState::load(dir.path(), "0.1.0");
        assert_eq!(state.updated_from, None);
        assert_eq!(read_saved(&dir.path().join(STATE_FILE)).last_run_version.as_deref(), Some("0.1.0"));
    }
}
