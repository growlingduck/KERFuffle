//! Forward-only schema migrations. Each lives in its own numbered SQL file and
//! is listed here once. The schema version is kept in `meta.schema_version`.

use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension};

use super::backup::{create_and_rotate, BackupPolicy};
use super::error::{DbError, DbResult};
use super::materials::{rough_prices, STANDARD_MATERIALS_JSON};
use super::models::Material;

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
    /// Data to add once the SQL has run, in the same transaction.
    then: Option<fn(&Connection) -> DbResult<()>>,
}

const MIGRATIONS: &[Migration] = &[
    Migration { version: 1, name: "initial", sql: include_str!("0001_initial.sql"), then: None },
    Migration { version: 2, name: "cabinet runs", sql: include_str!("0002_cabinet_runs.sql"), then: None },
    Migration {
        version: 3,
        name: "materials",
        sql: include_str!("0003_materials.sql"),
        then: Some(seed_standard_materials),
    },
    Migration { version: 4, name: "saw profiles", sql: include_str!("0004_saw_profiles.sql"), then: None },
    Migration { version: 5, name: "saved layouts", sql: include_str!("0005_layouts.sql"), then: None },
    Migration { version: 6, name: "defaults checked", sql: include_str!("0006_defaults_checked.sql"), then: None },
    Migration {
        version: 7,
        name: "rough prices",
        sql: include_str!("0007_rough_prices.sql"),
        then: Some(fill_rough_prices),
    },
];

/// Must equal the last entry in `MIGRATIONS` (checked by a test).
pub const LATEST_VERSION: i64 = 7;

/// The standard materials (plan §3.1), added once when the catalog is created,
/// without prices (migration 7 adds rough ones). Written as the catalog was at
/// version 3, so a new database can still run every migration in order.
fn seed_standard_materials(conn: &Connection) -> DbResult<()> {
    let materials: Vec<Material> = serde_json::from_str(STANDARD_MATERIALS_JSON)?;
    for (position, material) in materials.iter().enumerate() {
        let m = material.normalized();
        m.check()?;
        conn.execute(
            "INSERT INTO materials (position, id, kind, name, thickness, length, width, grain, banding_width,
               roll_feet, unit, price_cents, supplier, sku, notes, on_hand, archived, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, NULL, NULL, NULL, NULL, 0,
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            params![
                position as i64,
                m.id,
                m.kind.as_str(),
                m.name,
                m.thickness,
                m.length,
                m.width,
                m.grain.as_str(),
                m.banding_width,
                m.roll_feet,
                m.unit,
            ],
        )?;
    }
    Ok(())
}

/// Rough starting prices on the standard materials that have none, flagged as
/// rough, so a new shop sees an estimate right away. A price the shop entered
/// is never touched.
fn fill_rough_prices(conn: &Connection) -> DbResult<()> {
    for (id, cents) in rough_prices()? {
        conn.execute(
            "UPDATE materials SET price_cents = ?2, price_estimated = 1 WHERE id = ?1 AND price_cents IS NULL",
            params![id, cents],
        )?;
    }
    Ok(())
}

#[cfg(test)]
pub fn listed_versions() -> Vec<i64> {
    MIGRATIONS.iter().map(|m| m.version).collect()
}

/// A new database brought up to `version` only (SQL and data), for testing a later migration.
#[cfg(test)]
pub fn build_through(conn: &Connection, version: i64) -> DbResult<()> {
    for m in MIGRATIONS.iter().filter(|m| m.version <= version) {
        conn.execute_batch(m.sql)?;
        if let Some(then) = m.then {
            then(conn)?;
        }
    }
    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![version.to_string()],
    )?;
    Ok(())
}

/// The SQL of migrations 1..=`version`, for building an older database in tests.
#[cfg(test)]
pub fn sql_through(version: i64) -> String {
    MIGRATIONS.iter().filter(|m| m.version <= version).map(|m| m.sql).collect::<Vec<_>>().join("\n")
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct MigrationReport {
    pub from_version: i64,
    pub to_version: i64,
    /// Copy taken before migrating an existing database, if one was needed.
    pub backup: Option<PathBuf>,
}

/// The schema version recorded in the database; 0 for a new, empty database.
pub fn schema_version(conn: &Connection) -> DbResult<i64> {
    let has_meta: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta')",
        [],
        |row| row.get(0),
    )?;
    if !has_meta {
        return Ok(0);
    }
    let value: Option<String> = conn
        .query_row("SELECT value FROM meta WHERE key = 'schema_version'", [], |row| row.get(0))
        .optional()?;
    match value {
        None => Ok(0),
        Some(text) => text
            .parse()
            .map_err(|_| DbError::Corrupt(format!("schema_version is {text:?}"))),
    }
}

/// Bring the database up to `LATEST_VERSION`.
///
/// If a backup policy is given and the database already holds data, a checked
/// backup is taken first (db/backup.rs). All pending migrations then run in one
/// transaction, so a failure leaves the database exactly as it was.
pub fn migrate(conn: &mut Connection, backups: Option<&BackupPolicy>) -> DbResult<MigrationReport> {
    let from_version = schema_version(conn)?;
    if from_version > LATEST_VERSION {
        return Err(DbError::NewerSchema { found: from_version, supported: LATEST_VERSION });
    }
    let mut report = MigrationReport { from_version, to_version: from_version, backup: None };
    if from_version == LATEST_VERSION {
        return Ok(report);
    }

    if let Some(policy) = backups {
        if has_user_tables(conn)? {
            let backup = create_and_rotate(conn, policy).map_err(|error| {
                DbError::Backup(format!(
                    "KERFuffle needs to upgrade the job database but couldn't back it up first, so it was left unchanged. {error}"
                ))
            })?;
            report.backup = Some(policy.dir.join(backup.file_name));
        }
    }

    let tx = conn.transaction()?;
    for migration in MIGRATIONS.iter().filter(|m| m.version > from_version) {
        let failed = |error: &dyn std::fmt::Display| {
            DbError::Storage(format!(
                "upgrading the database to version {} ({}) failed: {error}",
                migration.version, migration.name
            ))
        };
        tx.execute_batch(migration.sql).map_err(|error| failed(&error))?;
        if let Some(then) = migration.then {
            then(&tx).map_err(|error| failed(&error))?;
        }
    }
    tx.execute(
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![LATEST_VERSION.to_string()],
    )?;
    tx.execute(
        "INSERT INTO meta (key, value) VALUES ('created_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (key) DO NOTHING",
        [],
    )?;
    tx.execute(
        "INSERT INTO meta (key, value) VALUES ('app_version', ?1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![env!("CARGO_PKG_VERSION")],
    )?;
    tx.commit()?;

    report.to_version = LATEST_VERSION;
    Ok(report)
}

fn has_user_tables(conn: &Connection) -> DbResult<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%')",
        [],
        |row| row.get(0),
    )?)
}
