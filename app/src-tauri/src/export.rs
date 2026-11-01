//! Cut-list output: the Save dialog, CSV files, print-to-PDF and the print
//! dialog. Errors come back as `{ kind, message }` with a message written for
//! the person at the saw; the TypeScript side is app/src/platform/export.ts.
//! Job files (.kerfjob) are saved through the same dialog and writer.
//!
//! The PDF and the printout are both drawn by WebView2 from the page the user
//! is looking at, with the same print stylesheet. There is no second renderer.

use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExportErrorKind {
    /// The file is open in another program (Excel, a PDF viewer).
    FileInUse,
    DiskFull,
    /// Windows refused the folder (read-only, protected).
    Denied,
    /// This WebView2 is too old for the feature; the app falls back.
    Unsupported,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportError {
    kind: ExportErrorKind,
    message: String,
}

impl ExportError {
    fn new(kind: ExportErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }

    /// Plain-language message for a failed write to `path`.
    fn from_io(error: &io::Error, path: &Path) -> Self {
        let name = file_label(path);
        // Windows: 32 sharing violation, 33 lock violation, 112 disk full, 39 handle disk full.
        match error.raw_os_error() {
            Some(32) | Some(33) => Self::new(
                ExportErrorKind::FileInUse,
                format!("{name} is open in another program. Close it there, then try again."),
            ),
            Some(112) | Some(39) => Self::new(
                ExportErrorKind::DiskFull,
                "The disk is full. Free up some space or pick another drive, then try again.",
            ),
            _ if error.kind() == io::ErrorKind::StorageFull => Self::new(
                ExportErrorKind::DiskFull,
                "The disk is full. Free up some space or pick another drive, then try again.",
            ),
            // Replacing a file that's open in Excel can also come back as "access denied".
            _ if error.kind() == io::ErrorKind::PermissionDenied && path.exists() => Self::new(
                ExportErrorKind::FileInUse,
                format!("{name} couldn’t be replaced. If it’s open in another program, close it there, then try again."),
            ),
            _ if error.kind() == io::ErrorKind::PermissionDenied => Self::new(
                ExportErrorKind::Denied,
                "KERFuffle isn’t allowed to save in that folder. Try again and pick another folder, such as Documents.",
            ),
            _ => Self::new(
                ExportErrorKind::Failed,
                format!("{name} couldn’t be saved ({error}). Try again."),
            ),
        }
    }
}

fn file_label(path: &Path) -> String {
    path.file_name()
        .map(|n| format!("“{}”", n.to_string_lossy()))
        .unwrap_or_else(|| "The file".into())
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExportKind {
    Csv,
    Pdf,
    /// A .kerfjob file for moving a job to another PC.
    Job,
}

/// Page size in inches, matching the print stylesheet's `@page` size.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSize {
    width_in: f64,
    height_in: f64,
}

/// `Documents\KERFuffle`, created if needed. Falls back to Documents.
fn default_export_dir(app: &AppHandle) -> Option<PathBuf> {
    let documents = app.path().document_dir().ok()?;
    let dir = documents.join("KERFuffle");
    Some(if std::fs::create_dir_all(&dir).is_ok() { dir } else { documents })
}

/// Ask where to save. `None` when the user cancels.
#[tauri::command]
pub async fn choose_export_path(
    app: AppHandle,
    file_name: String,
    kind: ExportKind,
) -> Result<Option<String>, ExportError> {
    let (label, extension) = match kind {
        ExportKind::Csv => ("CSV for Excel", "csv"),
        ExportKind::Pdf => ("PDF", "pdf"),
        ExportKind::Job => ("KERFuffle job", "kerfjob"),
    };
    let mut dialog = app
        .dialog()
        .file()
        .set_title(match kind {
            ExportKind::Csv => "Export cut list as CSV",
            ExportKind::Pdf => "Save cut list as PDF",
            ExportKind::Job => "Export job file",
        })
        .set_file_name(&file_name)
        .add_filter(label, &[extension]);
    if let Some(dir) = default_export_dir(&app) {
        dialog = dialog.set_directory(dir);
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    dialog.save_file(move |path| {
        let _ = tx.send(path);
    });
    let picked = rx.await.ok().flatten();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked
        .into_path()
        .map_err(|e| ExportError::new(ExportErrorKind::Failed, format!("That location can’t be used ({e}). Pick another folder.")))?;
    Ok(Some(with_extension(path, extension).to_string_lossy().into_owned()))
}

/// The dialog's filter usually adds the extension; make sure of it.
fn with_extension(path: PathBuf, extension: &str) -> PathBuf {
    let has = path
        .extension()
        .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case(extension));
    if has {
        path
    } else {
        let mut name = path.clone().into_os_string();
        name.push(".");
        name.push(extension);
        PathBuf::from(name)
    }
}

/// A sibling temp file, so a failed export never leaves a half-written file
/// under the real name and a locked target is reported by the final rename.
fn temp_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".{}.tmp", uuid::Uuid::new_v4().simple()));
    path.with_file_name(name)
}

fn replace(temp: &Path, path: &Path) -> Result<(), ExportError> {
    std::fs::rename(temp, path).map_err(|error| {
        let _ = std::fs::remove_file(temp);
        ExportError::from_io(&error, path)
    })
}

/// Write a text export (the CSV). The caller includes any byte-order mark.
#[tauri::command]
pub async fn write_export_file(path: String, contents: String) -> Result<(), ExportError> {
    let path = PathBuf::from(path);
    let temp = temp_path(&path);
    if let Err(error) = std::fs::write(&temp, contents.as_bytes()) {
        let _ = std::fs::remove_file(&temp);
        return Err(ExportError::from_io(&error, &path));
    }
    replace(&temp, &path)
}

/// Open File Explorer with the file selected.
#[tauri::command]
pub async fn reveal_in_folder(path: String) -> Result<(), ExportError> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // explorer.exe wants the switch and path as one raw argument.
        std::process::Command::new("explorer.exe")
            .raw_arg(format!("/select,\"{path}\""))
            .spawn()
            .map(|_| ())
            .map_err(|e| ExportError::new(ExportErrorKind::Failed, format!("File Explorer couldn’t be opened ({e}).")))
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err(ExportError::new(ExportErrorKind::Unsupported, "Show in folder is only available on Windows."))
    }
}

/// Save the page as a PDF with WebView2's own print engine and the print stylesheet.
#[tauri::command]
pub async fn print_to_pdf(window: WebviewWindow, path: String, page: PageSize) -> Result<(), ExportError> {
    let path = PathBuf::from(path);
    let temp = temp_path(&path);
    let printed = platform::print_to_pdf(&window, &temp, page).await;
    if let Err(error) = printed {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }
    replace(&temp, &path)
}

/// Open the Windows print dialog for the page (print stylesheet applies).
#[tauri::command]
pub async fn show_print_dialog(window: WebviewWindow) -> Result<(), ExportError> {
    platform::show_print_dialog(&window).await
}

#[cfg(windows)]
mod platform {
    use std::path::Path;
    use std::sync::{Arc, Mutex};

    use tauri::WebviewWindow;
    use tokio::sync::oneshot;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_16, ICoreWebView2_7, COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM,
        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    use super::{ExportError, ExportErrorKind, PageSize};

    const TOO_OLD_PDF: &str =
        "This copy of Microsoft Edge WebView2 is too old to save PDFs. Update Windows, or use Print… and pick “Microsoft Print to PDF”.";
    const TOO_OLD_PRINT: &str = "This copy of Microsoft Edge WebView2 can’t open the Windows print dialog.";

    fn failed(context: &str, error: impl std::fmt::Display) -> ExportError {
        ExportError::new(ExportErrorKind::Failed, format!("{context} ({error}). Try again."))
    }

    fn unsupported(message: &str) -> ExportError {
        ExportError::new(ExportErrorKind::Unsupported, message)
    }

    /// One reply, from whichever side finishes first: the completion handler,
    /// or the UI-thread code when the call couldn't start.
    type Reply = Arc<Mutex<Option<oneshot::Sender<Result<(), ExportError>>>>>;

    fn send(reply: &Reply, outcome: Result<(), ExportError>) {
        if let Some(tx) = reply.lock().ok().and_then(|mut slot| slot.take()) {
            let _ = tx.send(outcome);
        }
    }

    async fn wait(rx: oneshot::Receiver<Result<(), ExportError>>) -> Result<(), ExportError> {
        rx.await.unwrap_or_else(|_| {
            Err(ExportError::new(ExportErrorKind::Failed, "The window closed before it finished. Try again."))
        })
    }

    pub async fn print_to_pdf(window: &WebviewWindow, temp: &Path, page: PageSize) -> Result<(), ExportError> {
        let (tx, rx) = oneshot::channel();
        let reply: Reply = Arc::new(Mutex::new(Some(tx)));
        let target = HSTRING::from(temp.as_os_str());
        window
            .with_webview(move |webview| {
                // Runs on the UI thread, where WebView2 must be called.
                let start = || -> Result<(), ExportError> {
                    unsafe {
                        let core = webview.controller().CoreWebView2().map_err(|e| failed("The page couldn’t be reached", e))?;
                        let core7: ICoreWebView2_7 = core.cast().map_err(|_| unsupported(TOO_OLD_PDF))?;
                        let env6: ICoreWebView2Environment6 =
                            webview.environment().cast().map_err(|_| unsupported(TOO_OLD_PDF))?;
                        let settings = env6.CreatePrintSettings().map_err(|e| failed("Print settings couldn’t be made", e))?;
                        let set = |r: windows::core::Result<()>| r.map_err(|e| failed("Print settings couldn’t be made", e));
                        set(settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT))?;
                        set(settings.SetPageWidth(page.width_in))?;
                        set(settings.SetPageHeight(page.height_in))?;
                        set(settings.SetMarginTop(0.0))?;
                        set(settings.SetMarginBottom(0.0))?;
                        set(settings.SetMarginLeft(0.0))?;
                        set(settings.SetMarginRight(0.0))?;
                        set(settings.SetScaleFactor(1.0))?;
                        set(settings.SetShouldPrintBackgrounds(true))?;
                        set(settings.SetShouldPrintHeaderAndFooter(false))?;
                        let done = reply.clone();
                        let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                            send(
                                &done,
                                match result {
                                    Err(e) => Err(failed("The PDF couldn’t be created", e)),
                                    Ok(()) if !ok => Err(ExportError::new(
                                        ExportErrorKind::Failed,
                                        "The PDF couldn’t be created. Check there’s space on the disk, then try again.",
                                    )),
                                    Ok(()) => Ok(()),
                                },
                            );
                            Ok(())
                        }));
                        core7
                            .PrintToPdf(&target, &settings, &handler)
                            .map_err(|e| failed("The PDF couldn’t be started", e))
                    }
                };
                if let Err(error) = start() {
                    send(&reply, Err(error));
                }
            })
            .map_err(|e| failed("The page couldn’t be reached", e))?;
        wait(rx).await
    }

    pub async fn show_print_dialog(window: &WebviewWindow) -> Result<(), ExportError> {
        let (tx, rx) = oneshot::channel();
        let reply: Reply = Arc::new(Mutex::new(Some(tx)));
        window
            .with_webview(move |webview| {
                let outcome = unsafe {
                    webview
                        .controller()
                        .CoreWebView2()
                        .map_err(|e| failed("The page couldn’t be reached", e))
                        .and_then(|core| core.cast::<ICoreWebView2_16>().map_err(|_| unsupported(TOO_OLD_PRINT)))
                        .and_then(|core16| {
                            core16
                                .ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM)
                                .map_err(|e| failed("The print dialog couldn’t be opened", e))
                        })
                };
                send(&reply, outcome);
            })
            .map_err(|e| failed("The page couldn’t be reached", e))?;
        wait(rx).await
    }
}

#[cfg(not(windows))]
mod platform {
    use std::path::Path;

    use tauri::WebviewWindow;

    use super::{ExportError, ExportErrorKind, PageSize};

    pub async fn print_to_pdf(_: &WebviewWindow, _: &Path, _: PageSize) -> Result<(), ExportError> {
        Err(ExportError::new(ExportErrorKind::Unsupported, "Save PDF is only available on Windows."))
    }

    pub async fn show_print_dialog(_: &WebviewWindow) -> Result<(), ExportError> {
        Err(ExportError::new(ExportErrorKind::Unsupported, "The print dialog is only available on Windows."))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_a_missing_extension_only() {
        assert_eq!(with_extension(PathBuf::from(r"C:\a\Job – cut list"), "pdf"), PathBuf::from(r"C:\a\Job – cut list.pdf"));
        assert_eq!(with_extension(PathBuf::from(r"C:\a\list.PDF"), "pdf"), PathBuf::from(r"C:\a\list.PDF"));
        assert_eq!(with_extension(PathBuf::from(r"C:\a\v1.2"), "csv"), PathBuf::from(r"C:\a\v1.2.csv"));
    }

    #[test]
    fn explains_common_write_failures() {
        let path = Path::new(r"C:\nowhere\Kitchen – cut list.csv");
        let in_use = ExportError::from_io(&io::Error::from_raw_os_error(32), path);
        assert_eq!(in_use.kind, ExportErrorKind::FileInUse);
        assert!(in_use.message.contains("“Kitchen – cut list.csv” is open in another program"));
        assert_eq!(ExportError::from_io(&io::Error::from_raw_os_error(112), path).kind, ExportErrorKind::DiskFull);
        assert_eq!(
            ExportError::from_io(&io::Error::from(io::ErrorKind::PermissionDenied), path).kind,
            ExportErrorKind::Denied
        );
    }

    #[test]
    fn writes_through_a_temp_file_and_replaces_the_old_one() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("list.csv");
        std::fs::write(&path, "old").unwrap();
        tauri::async_runtime::block_on(write_export_file(path.to_string_lossy().into_owned(), "\u{feff}new".into()))
            .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), "\u{feff}new".as_bytes());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1, "no temp file left behind");
    }
}

