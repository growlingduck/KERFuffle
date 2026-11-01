use std::path::{Path, PathBuf};

use rusqlite::Connection;

use super::*;
use crate::db::{create_job, list_jobs, open, NewJob};

const STAMP: &str = "20261101-080200";

fn file_db(dir: &Path) -> (PathBuf, Connection) {
    let path = dir.join("kerfuffle.db");
    let (conn, _) = open(&path, None).unwrap();
    (path, conn)
}

fn add_job(conn: &mut Connection, name: &str) {
    create_job(conn, &NewJob { name: name.into(), customer: None, notes: None }).unwrap();
}

fn job_names(conn: &Connection) -> Vec<String> {
    let mut names: Vec<String> = list_jobs(conn).unwrap().into_iter().map(|j| j.name).collect();
    names.sort();
    names
}

fn files_in(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .map(|entries| entries.map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect())
        .unwrap_or_default();
    names.sort();
    names
}

fn policy(dir: &Path) -> BackupPolicy {
    BackupPolicy { dir: dir.join("Backups"), keep: DEFAULT_KEEP }
}

fn date(text: &str) -> Date {
    Date::parse_compact(text).unwrap()
}

// --- Names and dates ---------------------------------------------------------

#[test]
fn dates_count_days_and_weeks_start_on_monday() {
    assert_eq!(date("19700101").days(), 0);
    assert_eq!(date("20000301").days(), 11_017);
    assert_eq!(date("20261101").days() - date("20261001").days(), 31);
    // Sunday Nov 1 and Monday Oct 26 share a week; Monday Nov 2 starts the next.
    assert_eq!(date("20261101").week(), date("20261026").week());
    assert_eq!(date("20261102").week(), date("20261101").week() + 1);
    assert!(Date::new(2026, 2, 29).is_none());
    assert!(Date::new(2028, 2, 29).is_some());
}

#[test]
fn only_backup_file_names_are_recognized() {
    let name = BackupName::parse("kerfuffle-20261101-080200.db").unwrap();
    assert_eq!((name.date, name.time, name.seq), (date("20261101"), 80_200, 1));
    assert_eq!(name.created_at(), "2026-11-01T08:02:00");
    assert_eq!(BackupName::parse("kerfuffle-20261101-080200-2.db").unwrap().seq, 2);
    for other in [
        "kerfuffle.db",
        "kerfuffle-pre-migration-v1-20261031T140501Z.db",
        "kerfuffle-20261301-080200.db",
        "kerfuffle-20261101-250000.db",
        "kerfuffle-20261101-080200-1.db",
        "kerfuffle-20261101-080200.db.partial",
        "kerfuffle-20261101-080200-x.db",
        "notes.db",
    ] {
        assert!(BackupName::parse(other).is_none(), "{other}");
    }
}

// --- Making backups ----------------------------------------------------------

#[test]
fn a_backup_is_a_checked_self_contained_copy() {
    let dir = tempfile::tempdir().unwrap();
    let (_, mut conn) = file_db(dir.path());
    add_job(&mut conn, "Kitchen remodel");
    let backups = dir.path().join("Backups");

    let info = create_named(&conn, &backups, STAMP, |_| {}).unwrap();
    assert_eq!(info.file_name, "kerfuffle-20261101-080200.db");
    assert_eq!(info.created_at, "2026-11-01T08:02:00");
    assert_eq!(info.job_count, Some(1));
    assert!(info.size_bytes > 0);

    // A second backup in the same second gets its own name.
    let again = create_named(&conn, &backups, STAMP, |_| {}).unwrap();
    assert_eq!(again.file_name, "kerfuffle-20261101-080200-2.db");
    assert_eq!(files_in(&backups), ["kerfuffle-20261101-080200-2.db", "kerfuffle-20261101-080200.db"]);

    // The copy reads on its own: no WAL companion files, and the same jobs.
    let copy = Connection::open(backups.join(&info.file_name)).unwrap();
    let mode: String = copy.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
    assert_eq!(mode, "delete");
    assert_eq!(job_names(&copy), ["Kitchen remodel"]);
    assert_eq!(list(&backups).unwrap()[0], again, "newest first");
}

#[test]
fn a_copy_that_fails_its_check_is_deleted_and_reported() {
    let dir = tempfile::tempdir().unwrap();
    let (_, mut conn) = file_db(dir.path());
    for n in 0..20 {
        add_job(&mut conn, &format!("Job {n}"));
    }
    let backups = dir.path().join("Backups");
    let damage = |path: &Path| {
        let mut bytes = std::fs::read(path).unwrap();
        let end = bytes.len().min(16_384);
        bytes[4096..end].fill(0xAA);
        std::fs::write(path, bytes).unwrap();
    };
    let error = create_named(&conn, &backups, STAMP, damage).unwrap_err();
    assert_eq!(error.kind(), "backup");
    assert!(error.to_string().contains("didn't pass its check"), "{error}");
    assert!(error.to_string().contains("Your jobs are unchanged"), "{error}");
    assert!(files_in(&backups).is_empty(), "nothing kept that looks like a good backup");
    assert_eq!(list(&backups).unwrap(), []);
}

#[test]
fn an_unusable_backup_folder_is_reported() {
    let dir = tempfile::tempdir().unwrap();
    let (_, conn) = file_db(dir.path());
    let blocked = dir.path().join("a-file");
    std::fs::write(&blocked, "not a folder").unwrap();
    let error = create_named(&conn, &blocked.join("Backups"), STAMP, |_| {}).unwrap_err();
    assert_eq!(error.kind(), "backup");
    assert!(error.to_string().contains("backup folder"), "{error}");
}

#[test]
fn the_daily_backup_runs_once_a_day_and_not_before_there_are_jobs() {
    let dir = tempfile::tempdir().unwrap();
    let (_, mut conn) = file_db(dir.path());
    let policy = policy(dir.path());
    assert_eq!(daily(&conn, &policy).unwrap(), None, "nothing to back up yet");
    add_job(&mut conn, "Kitchen remodel");
    let first = daily(&conn, &policy).unwrap().expect("first launch today");
    assert_eq!(first.job_count, Some(1));
    assert_eq!(daily(&conn, &policy).unwrap(), None, "already backed up today");
    assert_eq!(list(&policy.dir).unwrap().len(), 1);
}

// --- Rotation ----------------------------------------------------------------

fn names(stamps: &[&str]) -> Vec<BackupName> {
    stamps.iter().map(|s| BackupName::parse(&format!("kerfuffle-{s}.db")).unwrap()).collect()
}

fn files(stamps: &[&str]) -> Vec<String> {
    stamps.iter().map(|s| format!("kerfuffle-{s}.db")).collect()
}

#[test]
fn rotation_keeps_the_latest_n_and_one_per_week_for_the_last_month() {
    // Today is Sunday, Nov 1, 2026. Its week began Monday, Oct 26.
    let daily_since = |first: u32| -> Vec<String> {
        (first..=31).map(|d| format!("202610{d:02}-080000")).chain(["20261101-080000".to_string()]).collect()
    };
    let october = daily_since(17);
    let october: Vec<&str> = october.iter().map(String::as_str).collect();

    struct Case<'a> {
        what: &'a str,
        backups: Vec<&'a str>,
        keep: u32,
        deleted: Vec<&'a str>,
    }
    let cases = [
        Case {
            what: "16 daily backups, keep 14: Oct 17 goes; Oct 18 is the only one left from its week",
            backups: october.clone(),
            keep: 14,
            deleted: vec!["20261017-080000"],
        },
        Case { what: "fewer than n: nothing goes", backups: october.clone(), keep: 30, deleted: vec![] },
        Case {
            what: "each recent week keeps its newest; older than a month goes",
            backups: vec!["20261101-080000", "20261031-080000", "20261030-080000", "20261020-080000", "20261005-080000", "20260901-080000"],
            keep: 3,
            deleted: vec!["20260901-080000"],
        },
        Case {
            what: "two in one recent week past n: the older goes",
            backups: vec!["20261101-080000", "20261022-080000", "20261020-080000"],
            keep: 1,
            deleted: vec!["20261020-080000"],
        },
        Case {
            what: "a week already covered by the latest n keeps nothing extra",
            backups: vec!["20261101-080000", "20261027-080000", "20261026-080000"],
            keep: 2,
            deleted: vec!["20261026-080000"],
        },
        Case {
            what: "31 days ago still counts as the last month; 32 does not",
            backups: vec!["20261101-080000", "20261001-080000", "20260930-080000"],
            keep: 1,
            deleted: vec!["20260930-080000"],
        },
        Case {
            what: "the newest of two backups in one second is the -2",
            backups: vec!["20261101-080000", "20261101-080000-2"],
            keep: 1,
            deleted: vec!["20261101-080000"],
        },
        Case {
            what: "keep 0 is treated as 1",
            backups: vec!["20261101-080000", "20261101-070000"],
            keep: 0,
            deleted: vec!["20261101-070000"],
        },
    ];
    for case in cases {
        let mut deleted = plan_rotation(&names(&case.backups), case.keep, date("20261101"));
        deleted.sort();
        let mut expected = files(&case.deleted);
        expected.sort();
        assert_eq!(deleted, expected, "{}", case.what);
    }
}

#[test]
fn rotation_deletes_files_and_leaves_other_files_alone() {
    let dir = tempfile::tempdir().unwrap();
    for name in files(&["20261101-080000", "20261024-080000", "20260801-080000"]).iter().chain(&["notes.txt".to_string()]) {
        std::fs::write(dir.path().join(name), "x").unwrap();
    }
    let deleted = rotate(dir.path(), 1, date("20261101")).unwrap();
    assert_eq!(deleted, files(&["20260801-080000"]));
    assert_eq!(files_in(dir.path()), ["kerfuffle-20261024-080000.db", "kerfuffle-20261101-080000.db", "notes.txt"]);
}

// --- Restore -----------------------------------------------------------------

#[test]
fn restore_puts_the_jobs_back_and_backs_up_the_current_ones_first() {
    let dir = tempfile::tempdir().unwrap();
    let (db_path, mut conn) = file_db(dir.path());
    let policy = policy(dir.path());
    add_job(&mut conn, "Kitchen remodel");
    let then = create_named(&conn, &policy.dir, "20261020-080000", |_| {}).unwrap();
    add_job(&mut conn, "Laundry room");

    let mut slot = Ok(conn);
    let restored = restore(&mut slot, &db_path, &policy, &then.file_name).unwrap();
    assert_eq!(restored.restored, then);
    let safety = restored.safety.expect("current jobs backed up first");
    assert_eq!(safety.job_count, Some(2));

    let conn = slot.as_ref().unwrap();
    assert_eq!(job_names(conn), ["Kitchen remodel"]);
    let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
    assert_eq!(mode, "wal", "the restored database is configured like any other");
    assert_eq!(files_in(dir.path()).iter().filter(|f| f.contains("restor")).count(), 0, "no leftovers");

    // Restoring the safety backup undoes the restore.
    restore(&mut slot, &db_path, &policy, &safety.file_name).unwrap();
    assert_eq!(job_names(slot.as_ref().unwrap()), ["Kitchen remodel", "Laundry room"]);
}

#[test]
fn restore_puts_the_original_back_when_the_restored_file_fails_to_open() {
    let dir = tempfile::tempdir().unwrap();
    let (db_path, mut conn) = file_db(dir.path());
    let policy = policy(dir.path());
    add_job(&mut conn, "Kitchen remodel");
    // A sound SQLite file that can't be upgraded: it has a meta table but no
    // schema version, so the first migration fails after the swap.
    std::fs::create_dir_all(&policy.dir).unwrap();
    let bad = "kerfuffle-20261020-080000.db";
    Connection::open(policy.dir.join(bad))
        .unwrap()
        .execute_batch("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
        .unwrap();

    let mut slot = Ok(conn);
    let error = restore(&mut slot, &db_path, &policy, bad).unwrap_err();
    assert_eq!(error.kind(), "backup");
    assert!(error.to_string().contains("put back as they were"), "{error}");

    let mut conn = slot.expect("the original database is open again");
    assert_eq!(job_names(&conn), ["Kitchen remodel"]);
    add_job(&mut conn, "Still writable");
    let leftovers: Vec<String> = files_in(dir.path()).into_iter().filter(|f| f.contains("restor")).collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[test]
fn restore_refuses_a_damaged_or_newer_backup_without_changing_anything() {
    let dir = tempfile::tempdir().unwrap();
    let (db_path, mut conn) = file_db(dir.path());
    let policy = policy(dir.path());
    add_job(&mut conn, "Kitchen remodel");
    std::fs::create_dir_all(&policy.dir).unwrap();
    let damaged = "kerfuffle-20261020-080000.db";
    std::fs::write(policy.dir.join(damaged), vec![0x42; 8192]).unwrap();
    let newer = "kerfuffle-20261021-080000.db";
    Connection::open(policy.dir.join(newer))
        .unwrap()
        .execute_batch("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('schema_version', '99');")
        .unwrap();

    let mut slot = Ok(conn);
    let error = restore(&mut slot, &db_path, &policy, damaged).unwrap_err();
    assert!(error.to_string().contains("damaged"), "{error}");
    let error = restore(&mut slot, &db_path, &policy, newer).unwrap_err();
    assert_eq!(error.kind(), "newerDatabase");
    for name in ["../kerfuffle.db", "kerfuffle.db", "kerfuffle-20261022-080000.db"] {
        assert_eq!(restore(&mut slot, &db_path, &policy, name).unwrap_err().kind(), "backup", "{name}");
    }

    assert_eq!(job_names(slot.as_ref().unwrap()), ["Kitchen remodel"]);
    assert_eq!(files_in(&policy.dir), [damaged, newer], "no safety backup for a restore that never started");
}

#[test]
fn restore_works_when_the_database_could_not_be_opened_and_keeps_the_unreadable_file() {
    let dir = tempfile::tempdir().unwrap();
    let (db_path, mut conn) = file_db(dir.path());
    let policy = policy(dir.path());
    add_job(&mut conn, "Kitchen remodel");
    let good = create_named(&conn, &policy.dir, "20261020-080000", |_| {}).unwrap();
    drop(conn);
    std::fs::write(&db_path, vec![0x42; 8192]).unwrap();

    let mut slot = open(&db_path, None).map(|(conn, _)| conn);
    assert!(slot.is_err(), "the damaged file doesn't open");
    let restored = restore(&mut slot, &db_path, &policy, &good.file_name).unwrap();
    assert_eq!(restored.safety, None);
    assert_eq!(job_names(slot.as_ref().unwrap()), ["Kitchen remodel"]);
    assert!(files_in(dir.path()).iter().any(|f| f.starts_with("kerfuffle.db.unreadable-")));
}
