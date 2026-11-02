//! Importing a job from a `.kerfjob` file. The file is read, checksummed and
//! validated by the client (app/src/data/jobFile.ts); this stores the job,
//! keeping its own rules snapshot.

use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;

use super::error::{DbError, DbResult};
use super::models::{check_job_materials, Cabinet, Job, JobStatus, RULES_VERSION};
use super::repo::{fresh_id, get_job, insert_job, next_job_number, now, write_cabinet, JobInsert};

/// A job as exported: every field, including the ones the database normally owns.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportJob {
    pub id: String,
    pub number: i64,
    pub name: String,
    pub customer: Option<String>,
    pub notes: Option<String>,
    pub status: JobStatus,
    pub rules: serde_json::Value,
    pub rules_version: i64,
    pub created_at: String,
    pub updated_at: String,
    pub revision: i64,
    pub cabinets: Vec<Cabinet>,
    /// Files from before materials have none.
    #[serde(default)]
    pub materials: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportMode {
    /// No job with this id here yet: store it as it is.
    New,
    /// A separate job: new id, next number, "(copy)", new cabinet ids.
    Copy,
    /// Overwrite the job with the same id. The caller backs up first.
    Replace,
}

impl ImportJob {
    fn check(&self) -> DbResult<()> {
        if self.id.trim().is_empty() {
            return Err(DbError::invalid("The job in this file has no id."));
        }
        if self.name.trim().is_empty() {
            return Err(DbError::invalid("The job in this file has no name."));
        }
        if self.number <= 0 {
            return Err(DbError::invalid("The job in this file has no job number."));
        }
        if self.revision < 0 {
            return Err(DbError::invalid("The job in this file has an impossible revision."));
        }
        if !(1..=RULES_VERSION).contains(&self.rules_version) {
            return Err(DbError::invalid(
                "This job was made by a newer KERFuffle. Update this PC first.",
            ));
        }
        if !self.rules.is_object() {
            return Err(DbError::invalid("The job's construction settings are missing."));
        }
        if let Some(materials) = &self.materials {
            check_job_materials(materials)?;
        }
        let mut seen = HashSet::new();
        for cabinet in &self.cabinets {
            cabinet.check()?;
            if !seen.insert(cabinet.id.as_str()) {
                return Err(DbError::invalid(format!("Cabinet {} appears twice in the job.", cabinet.label)));
            }
        }
        Ok(())
    }
}

fn job_exists(conn: &Connection, id: &str) -> DbResult<bool> {
    Ok(conn.query_row("SELECT EXISTS (SELECT 1 FROM jobs WHERE id = ?1)", [id], |row| row.get(0))?)
}

fn number_owner(conn: &Connection, number: i64) -> DbResult<Option<String>> {
    Ok(conn
        .query_row("SELECT id FROM jobs WHERE number = ?1", [number], |row| row.get(0))
        .optional()?)
}

/// True when any of these cabinet ids is already used by a job other than `job_id`.
fn cabinet_ids_taken(conn: &Connection, job_id: &str, cabinets: &[Cabinet]) -> DbResult<bool> {
    let mut stmt = conn.prepare("SELECT EXISTS (SELECT 1 FROM cabinets WHERE id = ?1 AND job_id <> ?2)")?;
    for cabinet in cabinets {
        if stmt.query_row(params![cabinet.id, job_id], |row| row.get::<_, bool>(0))? {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Store an imported job. Numbers and cabinet ids that clash with another job
/// on this PC are replaced; everything else is kept exactly as exported.
pub fn import_job(conn: &mut Connection, job: &ImportJob, mode: ImportMode) -> DbResult<Job> {
    job.check()?;
    let tx = conn.transaction()?;
    let exists = job_exists(&tx, &job.id)?;
    let id = match mode {
        ImportMode::New if exists => {
            return Err(DbError::invalid(
                "This job is already on this PC. Import it as a copy, or replace the existing one.",
            ))
        }
        ImportMode::Replace if !exists => return Err(DbError::JobNotFound),
        ImportMode::Copy => fresh_id(),
        ImportMode::New | ImportMode::Replace => job.id.clone(),
    };

    let mut replaced_number = None;
    if mode == ImportMode::Replace {
        replaced_number = Some(tx.query_row("SELECT number FROM jobs WHERE id = ?1", [&id], |row| row.get::<_, i64>(0))?);
        // Its cabinets and any unsaved journal go with it (ON DELETE CASCADE).
        tx.execute("DELETE FROM jobs WHERE id = ?1", [&id])?;
    }

    let number = match (mode, number_owner(&tx, job.number)?) {
        (ImportMode::Copy, _) => next_job_number(&tx)?,
        (_, None) => job.number,
        // Another job here has this number: keep the replaced job's own, or take the next.
        (_, Some(_)) => match replaced_number {
            Some(own) if number_owner(&tx, own)?.is_none() => own,
            _ => next_job_number(&tx)?,
        },
    };

    let stamp = now(&tx)?;
    let copy = mode == ImportMode::Copy;
    let name = if copy { format!("{} (copy)", job.name.trim()) } else { job.name.trim().to_string() };
    let rules = job.rules.to_string();
    let materials = job.materials.as_ref().map(serde_json::Value::to_string);
    insert_job(
        &tx,
        &JobInsert {
            id: &id,
            number,
            name: &name,
            customer: job.customer.as_deref().filter(|t| !t.trim().is_empty()),
            notes: job.notes.as_deref().filter(|t| !t.trim().is_empty()),
            status: job.status,
            rules_json: &rules,
            rules_version: job.rules_version,
            now: &stamp,
            materials_json: materials.as_deref(),
        },
    )?;
    if !copy {
        // Keep the job's own history: when it was made, last changed, and its revision.
        tx.execute(
            "UPDATE jobs SET created_at = ?2, updated_at = ?3, revision = ?4 WHERE id = ?1",
            params![id, job.created_at, job.updated_at, job.revision],
        )?;
    }

    let fresh_cabinet_ids = copy || cabinet_ids_taken(&tx, &id, &job.cabinets)?;
    for (position, cabinet) in job.cabinets.iter().enumerate() {
        let cabinet = if fresh_cabinet_ids { Cabinet { id: fresh_id(), ..cabinet.clone() } } else { cabinet.clone() };
        write_cabinet(&tx, &id, position as i64, &cabinet)?;
    }
    tx.commit()?;
    get_job(conn, &id)
}
