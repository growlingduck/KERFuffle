//! The job database: one SQLite file owned by the Rust side. The webview only
//! reaches it through the typed commands in `commands.rs`.

pub mod backup;
mod error;
mod journal;
mod materials;
mod migrations;
mod models;
mod repo;
mod samples;
mod transfer;

#[cfg(test)]
mod tests;

use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;

pub use backup::BackupPolicy;

pub use error::{DbError, DbResult};
pub use journal::{recover_pending_edits, write_pending_edit};
pub use materials::{delete_material, list_materials, save_material};
pub use migrations::{migrate, schema_version, MigrationReport, LATEST_VERSION};
pub use models::*;
pub use repo::*;
pub use samples::{add_example_job, load_sample_jobs};
pub use transfer::{import_job, ImportJob, ImportMode};

pub const DB_FILE_NAME: &str = "kerfuffle.db";

/// Open (creating if needed) the database at `path` and bring its schema up to
/// date. With a backup policy, an existing database is backed up before any migration.
pub fn open(path: &Path, backups: Option<&BackupPolicy>) -> DbResult<(Connection, MigrationReport)> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut conn = Connection::open(path)?;
    configure(&conn)?;
    let report = migrate(&mut conn, backups)?;
    Ok((conn, report))
}

/// A migrated database that lives only in memory (tests).
pub fn open_in_memory() -> DbResult<Connection> {
    let mut conn = Connection::open_in_memory()?;
    configure(&conn)?;
    migrate(&mut conn, None)?;
    Ok(conn)
}

fn configure(conn: &Connection) -> DbResult<()> {
    conn.busy_timeout(Duration::from_secs(5))?;
    // WAL keeps readers and the writer out of each other's way; with
    // synchronous=NORMAL a committed transaction survives an app crash.
    let _mode: String =
        conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get(0))?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;")?;
    Ok(())
}
