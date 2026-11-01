//! Double-clicking a `.kerfjob` (the installer registers the file type) starts
//! KERFuffle with the file's path as an argument. If KERFuffle is already open,
//! the single-instance plugin hands the second launch's arguments to the
//! running app instead, which comes to the front. Either way the path waits
//! here until the webview takes it and starts the import preview (prompt 07).

use std::path::Path;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

pub const OPENED_EVENT: &str = "job-file-opened";

#[derive(Default)]
pub struct OpenedFiles(Mutex<Option<String>>);

impl OpenedFiles {
    pub fn set(&self, path: Option<String>) {
        if path.is_some() {
            *self.0.lock().unwrap_or_else(|e| e.into_inner()) = path;
        }
    }
}

/// The first `.kerfjob` among the arguments (after the program name), made
/// absolute against `cwd`. Windows passes an absolute path for a double-click.
pub fn job_file_arg<I, S>(args: I, cwd: &Path) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().skip(1).find_map(|arg| {
        let arg = arg.as_ref();
        if !arg.to_lowercase().ends_with(".kerfjob") {
            return None;
        }
        let path = Path::new(arg);
        let path = if path.is_absolute() { path.to_path_buf() } else { cwd.join(path) };
        Some(path.to_string_lossy().into_owned())
    })
}

/// A second launch: bring the window forward and pass on its file, if any.
pub fn on_second_instance(app: &AppHandle, args: Vec<String>, cwd: String) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    // try_state: a launch that lands before setup() has managed the state is
    // dropped rather than panicking the open app.
    if let (Some(path), Some(opened)) = (job_file_arg(&args, Path::new(&cwd)), app.try_state::<OpenedFiles>()) {
        opened.set(Some(path));
        let _ = app.emit(OPENED_EVENT, ());
    }
}

/// The waiting `.kerfjob` path, once.
#[tauri::command]
pub fn take_opened_job_file(state: tauri::State<'_, OpenedFiles>) -> Option<String> {
    state.0.lock().unwrap_or_else(|e| e.into_inner()).take()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_job_file_argument() {
        let cwd = Path::new(r"C:\Users\Shop");
        assert_eq!(job_file_arg(["kerfuffle.exe"], cwd), None);
        assert_eq!(job_file_arg(["kerfuffle.exe", "notes.txt"], cwd), None);
        assert_eq!(
            job_file_arg(["kerfuffle.exe", r"D:\USB\Kitchen (J-0014).KERFJOB"], cwd).as_deref(),
            Some(r"D:\USB\Kitchen (J-0014).KERFJOB")
        );
        assert_eq!(job_file_arg(["kerfuffle.exe", "job.kerfjob"], cwd).as_deref(), Some(r"C:\Users\Shop\job.kerfjob"));
        // The program name itself is never taken as a job file.
        assert_eq!(job_file_arg(["odd.kerfjob"], cwd), None);
    }
}
