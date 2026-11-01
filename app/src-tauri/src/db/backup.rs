//! Rotating backups of the job database.
//!
//! A backup is a complete SQLite file, `kerfuffle-YYYYMMDD-HHMMSS.db` (local
//! time), made with SQLite's online backup API. It is written under a
//! `.partial` name, checked with `PRAGMA integrity_check`, and only then given
//! its real name, so a file with the real name is always a good copy. A copy
//! that fails the check is deleted and the failure reported.
//!
//! Backups are taken once a day at the first launch, before a schema
//! migration, before a restore, before an import replaces a job, and on demand.

use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::backup::Backup;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;

use super::error::{DbError, DbResult};
use super::migrations::{schema_version, LATEST_VERSION};

pub const DEFAULT_KEEP: u32 = 14;
pub const MAX_KEEP: u32 = 365;
/// Backups from the last this-many days keep at least one per week.
pub const WEEKLY_WINDOW_DAYS: i64 = 31;

const PREFIX: &str = "kerfuffle-";
const EXTENSION: &str = ".db";

/// Where backups go and how many to keep.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackupPolicy {
    pub dir: PathBuf,
    pub keep: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub file_name: String,
    /// When it was taken, in this PC's local time: `2026-11-01T08:02:00`.
    pub created_at: String,
    pub size_bytes: u64,
    /// Jobs in the backup; None when it holds no job table (e.g. a very old schema).
    pub job_count: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Restored {
    /// The backup that is now the job database.
    pub restored: BackupInfo,
    /// The copy of the jobs from just before the restore; None when they couldn't be read.
    pub safety: Option<BackupInfo>,
}

// ---------------------------------------------------------------------------
// Dates and file names
// ---------------------------------------------------------------------------

/// A calendar date (no time zone: backup names use the PC's local time).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Date {
    year: i32,
    month: u32,
    day: u32,
}

impl Date {
    pub fn new(year: i32, month: u32, day: u32) -> Option<Self> {
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
        let days_in_month = match month {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            2 if leap => 29,
            2 => 28,
            _ => return None,
        };
        (1..=days_in_month).contains(&day).then_some(Self { year, month, day })
    }

    /// `YYYYMMDD`.
    pub fn parse_compact(text: &str) -> Option<Self> {
        if text.len() != 8 || !text.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        Self::new(text[0..4].parse().ok()?, text[4..6].parse().ok()?, text[6..8].parse().ok()?)
    }

    /// Days since 1970-01-01 (Howard Hinnant's days_from_civil).
    pub fn days(self) -> i64 {
        let y = i64::from(self.year) - i64::from(self.month <= 2);
        let era = y.div_euclid(400);
        let yoe = y - era * 400;
        let m = i64::from(self.month);
        let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + i64::from(self.day) - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146_097 + doe - 719_468
    }

    /// Weeks run Monday to Sunday. 1970-01-01 was a Thursday.
    fn week(self) -> i64 {
        (self.days() + 3).div_euclid(7)
    }
}

/// What a backup's file name says about it. Orders oldest first.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct BackupName {
    pub date: Date,
    /// HHMMSS.
    pub time: u32,
    /// 1 for `…-080200.db`, 2 for a second backup in the same second (`…-080200-2.db`).
    pub seq: u32,
    pub file_name: String,
}

impl BackupName {
    pub fn parse(file_name: &str) -> Option<Self> {
        let stem = file_name.strip_prefix(PREFIX)?.strip_suffix(EXTENSION)?;
        let mut parts = stem.split('-');
        let date = Date::parse_compact(parts.next()?)?;
        let time_text = parts.next()?;
        if time_text.len() != 6 || !time_text.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        let time: u32 = time_text.parse().ok()?;
        if time / 10_000 > 23 || time / 100 % 100 > 59 || time % 100 > 59 {
            return None;
        }
        let seq = match parts.next() {
            None => 1,
            Some(n) if !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) => n.parse().ok().filter(|&n| n >= 2)?,
            Some(_) => return None,
        };
        if parts.next().is_some() {
            return None;
        }
        Some(Self { date, time, seq, file_name: file_name.to_string() })
    }

    /// `2026-11-01T08:02:00`, local time.
    fn created_at(&self) -> String {
        let Date { year, month, day } = self.date;
        let (h, m, s) = (self.time / 10_000, self.time / 100 % 100, self.time % 100);
        format!("{year:04}-{month:02}-{day:02}T{h:02}:{m:02}:{s:02}")
    }
}

/// The PC's local date and time from SQLite, as `YYYYMMDD-HHMMSS`.
pub fn local_stamp(conn: &Connection) -> DbResult<String> {
    Ok(conn.query_row("SELECT strftime('%Y%m%d-%H%M%S', 'now', 'localtime')", [], |row| row.get(0))?)
}

fn stamp_date(stamp: &str) -> DbResult<Date> {
    Date::parse_compact(stamp.get(0..8).unwrap_or_default())
        .ok_or_else(|| DbError::Storage(format!("the clock gave an unreadable time ({stamp})")))
}

// ---------------------------------------------------------------------------
// Making backups
// ---------------------------------------------------------------------------

fn failed(message: impl Into<String>) -> DbError {
    DbError::Backup(message.into())
}

/// Back up now, then delete backups the policy no longer keeps.
pub fn create_and_rotate(conn: &Connection, policy: &BackupPolicy) -> DbResult<BackupInfo> {
    let stamp = local_stamp(conn)?;
    let info = create_named(conn, &policy.dir, &stamp, |_| {})?;
    // Rotation is housekeeping: a failure there must not undo a good backup.
    if let Err(error) = rotate(&policy.dir, policy.keep, stamp_date(&stamp)?) {
        eprintln!("KERFuffle: couldn't delete old backups: {error}");
    }
    Ok(info)
}

/// The once-a-day backup. None when there is already one from today, or no jobs to back up.
pub fn daily(conn: &Connection, policy: &BackupPolicy) -> DbResult<Option<BackupInfo>> {
    let today = stamp_date(&local_stamp(conn)?)?;
    if list_names(&policy.dir)?.iter().any(|name| name.date == today) {
        return Ok(None);
    }
    let has_jobs: bool = conn
        .query_row("SELECT EXISTS (SELECT 1 FROM jobs)", [], |row| row.get(0))
        .unwrap_or(false);
    if !has_jobs {
        return Ok(None);
    }
    create_and_rotate(conn, policy).map(Some)
}

/// Write a checked backup named for `stamp`. `after_copy` runs between the copy
/// and the check (tests use it to damage the copy).
pub(crate) fn create_named(
    conn: &Connection,
    dir: &Path,
    stamp: &str,
    after_copy: impl FnOnce(&Path),
) -> DbResult<BackupInfo> {
    std::fs::create_dir_all(dir).map_err(|error| {
        failed(format!(
            "KERFuffle couldn't use the backup folder {} ({error}). Your jobs are unchanged. Pick another folder in Settings.",
            dir.display()
        ))
    })?;
    let mut name = format!("{PREFIX}{stamp}{EXTENSION}");
    let mut n = 1;
    while dir.join(&name).exists() {
        n += 1;
        name = format!("{PREFIX}{stamp}-{n}{EXTENSION}");
    }
    let path = dir.join(&name);
    let partial = dir.join(format!("{name}.partial"));

    let made = copy_database(conn, &partial).map_err(|error| {
        failed(format!("The backup couldn't be written ({error}). Your jobs are unchanged."))
    });
    let checked = made.and_then(|()| {
        after_copy(&partial);
        check_integrity(&partial).map_err(|problem| {
            failed(format!(
                "The backup copy didn't pass its check ({problem}), so it was deleted. Your jobs are unchanged. Try again."
            ))
        })
    });
    if let Err(error) = checked {
        let _ = std::fs::remove_file(&partial);
        return Err(error);
    }
    std::fs::rename(&partial, &path).map_err(|error| {
        let _ = std::fs::remove_file(&partial);
        failed(format!("The backup couldn't be saved ({error}). Your jobs are unchanged."))
    })?;
    info_for(&path, &BackupName::parse(&name).expect("names made here parse"))
}

/// Copy the whole database into `target` with the online backup API. The copy
/// uses a rollback journal, so it is one self-contained file.
fn copy_database(conn: &Connection, target: &Path) -> Result<(), rusqlite::Error> {
    let _ = std::fs::remove_file(target);
    let mut copy = Connection::open(target)?;
    {
        let backup = Backup::new(conn, &mut copy)?;
        backup.run_to_completion(256, Duration::ZERO, None)?;
    }
    let _mode: String = copy.pragma_update_and_check(None, "journal_mode", "DELETE", |row| row.get(0))?;
    copy.close().map_err(|(_, error)| error)
}

fn open_read_only(path: &Path) -> Result<Connection, rusqlite::Error> {
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
}

/// `Ok` only when SQLite reads the file back and reports "ok".
fn check_integrity(path: &Path) -> Result<(), String> {
    let conn = open_read_only(path).map_err(|error| error.to_string())?;
    let mut stmt = conn.prepare("PRAGMA integrity_check").map_err(|error| error.to_string())?;
    let rows: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .and_then(|rows| rows.collect())
        .map_err(|error| error.to_string())?;
    if rows == ["ok"] {
        Ok(())
    } else {
        Err(rows.into_iter().take(3).collect::<Vec<_>>().join("; "))
    }
}

// ---------------------------------------------------------------------------
// Listing and rotation
// ---------------------------------------------------------------------------

fn list_names(dir: &Path) -> DbResult<Vec<BackupName>> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        if let Some(name) = BackupName::parse(&entry.file_name().to_string_lossy()) {
            names.push(name);
        }
    }
    Ok(names)
}

fn info_for(path: &Path, name: &BackupName) -> DbResult<BackupInfo> {
    let job_count = open_read_only(path)
        .and_then(|conn| conn.query_row("SELECT COUNT(*) FROM jobs", [], |row| row.get(0)))
        .ok();
    Ok(BackupInfo {
        file_name: name.file_name.clone(),
        created_at: name.created_at(),
        size_bytes: std::fs::metadata(path)?.len(),
        job_count,
    })
}

/// Backups in `dir`, newest first. Files that don't follow the naming pattern are ignored.
pub fn list(dir: &Path) -> DbResult<Vec<BackupInfo>> {
    let mut names = list_names(dir)?;
    names.sort_by(|a, b| b.cmp(a));
    names.iter().map(|name| info_for(&dir.join(&name.file_name), name)).collect()
}

/// Which backups to delete: everything past the newest `keep`, except that
/// each week in the last month keeps its newest backup, so a week is never
/// left with none. Returns file names.
pub fn plan_rotation(names: &[BackupName], keep: u32, today: Date) -> Vec<String> {
    let mut newest_first: Vec<&BackupName> = names.iter().collect();
    newest_first.sort_by(|a, b| b.cmp(a));
    let keep = keep.max(1) as usize;
    let window_start = today.days() - WEEKLY_WINDOW_DAYS;
    let mut weeks_kept = std::collections::HashSet::new();
    let mut delete = Vec::new();
    for (index, name) in newest_first.into_iter().enumerate() {
        let recent = name.date.days() >= window_start;
        let keep_it = index < keep || (recent && !weeks_kept.contains(&name.date.week()));
        if keep_it {
            weeks_kept.insert(name.date.week());
        } else {
            delete.push(name.file_name.clone());
        }
    }
    delete
}

/// Delete backups the policy no longer keeps. Returns the deleted file names.
pub fn rotate(dir: &Path, keep: u32, today: Date) -> DbResult<Vec<String>> {
    let doomed = plan_rotation(&list_names(dir)?, keep, today);
    for file_name in &doomed {
        std::fs::remove_file(dir.join(file_name))?;
    }
    Ok(doomed)
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

/// The database file and its WAL companions, which must move together.
fn with_companions(path: &Path) -> [PathBuf; 3] {
    [path.to_path_buf(), sidecar(path, "-wal"), sidecar(path, "-shm")]
}

fn move_with_companions(from: &Path, to: &Path) -> std::io::Result<()> {
    for (a, b) in with_companions(from).iter().zip(with_companions(to).iter()) {
        if a.exists() {
            std::fs::rename(a, b)?;
        }
    }
    Ok(())
}

fn remove_with_companions(path: &Path) {
    for file in with_companions(path) {
        let _ = std::fs::remove_file(file);
    }
}

/// Close the connection with everything in the main file: switching to a
/// rollback journal checkpoints the WAL and removes it.
/// On failure the still-open connection comes back with the error.
fn close_cleanly(conn: Connection) -> Result<(), Box<(Connection, DbError)>> {
    if let Err(error) = conn.pragma_update_and_check(None, "journal_mode", "DELETE", |row| row.get::<_, String>(0)) {
        return Err(Box::new((conn, error.into())));
    }
    conn.close().map_err(|(conn, error)| Box::new((conn, error.into())))
}

/// Replace the job database with a backup.
///
/// The current jobs are backed up first. The database is closed, the file is
/// swapped, and the restored file is opened and migrated. If anything after the
/// close fails, the original file is put back and reopened. `slot` holds the
/// open database (or why it couldn't be opened) before and after.
pub fn restore(
    slot: &mut DbResult<Connection>,
    db_path: &Path,
    policy: &BackupPolicy,
    file_name: &str,
) -> DbResult<Restored> {
    let chosen = BackupName::parse(file_name)
        .filter(|name| name.file_name == file_name)
        .ok_or_else(|| failed("That isn't one of KERFuffle's backups."))?;
    let source = policy.dir.join(&chosen.file_name);
    if !source.is_file() {
        return Err(failed("That backup is no longer in the backup folder. Nothing was changed."));
    }
    check_integrity(&source).map_err(|problem| {
        failed(format!("That backup is damaged ({problem}), so it can't be restored. Nothing was changed. Pick another backup."))
    })?;
    {
        let conn = open_read_only(&source)?;
        let found = schema_version(&conn)?;
        if found > LATEST_VERSION {
            return Err(DbError::NewerSchema { found, supported: LATEST_VERSION });
        }
    }
    let restored = info_for(&source, &chosen)?;

    // 1. Back up the jobs as they are now (if the database could be opened at all).
    let safety = match slot.as_ref() {
        Ok(conn) => Some(create_named(conn, &policy.dir, &local_stamp(conn)?, |_| {})?),
        Err(_) => None,
    };

    // 2. Close the database.
    let previous = std::mem::replace(slot, Err(DbError::Unavailable("a backup is being restored.".into())));
    let had_connection = previous.is_ok();
    if let Ok(conn) = previous {
        if let Err(failed) = close_cleanly(conn) {
            let (conn, error) = *failed;
            *slot = Ok(conn);
            return Err(error);
        }
    }

    // 3. Swap the files, then open (and migrate) the restored one.
    let aside = sidecar(db_path, ".before-restore");
    let incoming = sidecar(db_path, ".restoring");
    let reopen_original = |slot: &mut DbResult<Connection>| {
        *slot = super::open(db_path, None).map(|(conn, _)| conn);
    };

    remove_with_companions(&incoming);
    if let Err(error) = std::fs::copy(&source, &incoming) {
        let _ = std::fs::remove_file(&incoming);
        reopen_original(slot);
        return Err(failed(format!("The backup couldn't be copied ({error}). Nothing was changed.")));
    }
    remove_with_companions(&aside);
    if let Err(error) = move_with_companions(db_path, &aside) {
        // Whatever moved goes back before the original is reopened.
        let _ = move_with_companions(&aside, db_path);
        let _ = std::fs::remove_file(&incoming);
        reopen_original(slot);
        return Err(failed(format!("The job database couldn't be moved aside ({error}). Nothing was changed.")));
    }
    let opened = std::fs::rename(&incoming, db_path)
        .map_err(|error| failed(format!("The backup couldn't be put in place ({error}).")))
        .and_then(|()| super::open(db_path, None).map(|(conn, _)| conn));

    match opened {
        Ok(conn) => {
            *slot = Ok(conn);
            if had_connection {
                // The safety backup holds these jobs, checked.
                remove_with_companions(&aside);
            } else {
                // The old file couldn't be opened; keep it for whoever looks into it.
                let damaged = sidecar(db_path, &format!(".unreadable-{}", stamp_or_unknown(slot)));
                let _ = move_with_companions(&aside, &damaged);
            }
            Ok(Restored { restored, safety })
        }
        Err(error) => {
            remove_with_companions(db_path);
            let _ = std::fs::remove_file(&incoming);
            let put_back = move_with_companions(&aside, db_path);
            reopen_original(slot);
            Err(match put_back {
                Ok(()) => failed(format!(
                    "The backup couldn't be opened ({error}), so your jobs were put back as they were."
                )),
                Err(io) => failed(format!(
                    "The backup couldn't be opened ({error}), and the jobs from before couldn't be put back ({io}). Restore the newest backup."
                )),
            })
        }
    }
}

fn stamp_or_unknown(slot: &DbResult<Connection>) -> String {
    slot.as_ref().ok().and_then(|conn| local_stamp(conn).ok()).unwrap_or_else(|| "unknown".into())
}

#[cfg(test)]
#[path = "backup_tests.rs"]
mod tests;
