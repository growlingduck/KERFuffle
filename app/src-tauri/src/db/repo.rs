//! Repository functions. Every write that changes a job runs in one transaction
//! and bumps the job's `revision` and `updated_at`.

use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension, Row};

use super::error::{DbError, DbResult};
use super::materials::ESTIMATE_SETTING;
use super::models::{
    check_job_materials, Cabinet, CabinetOutline, CabinetType, ConstructionChoice, FinishedEnds, Job, JobFields,
    MethodId, JobListItem, JobSnapshot, JobStatus, NewJob, Saved, RULES_VERSION,
};

/// Shop default rules used until the user saves their own (prompt 07). A test in
/// app/test keeps this in step with the engine's DEFAULT_RULES.
pub const DEFAULT_RULES_JSON: &str = include_str!("default_rules.json");

pub const RULES_SETTING: &str = "construction_rules";
/// Shop settings the app knows about. Anything else is refused. "backups" is
/// reserved: backup settings live in backup-settings.json (backups.rs), outside
/// the database, so a restore never moves the backup folder.
pub const SHOP_SETTING_KEYS: &[&str] = &[RULES_SETTING, "display", "backups", ESTIMATE_SETTING];

const JOB_COLUMNS: &str = "id, number, name, customer, notes, status, rules_json, rules_version, \
                           created_at, updated_at, revision, materials_json";
const CABINET_COLUMNS: &str =
    "id, label, type, width, height, depth, shelf_count, finished_ends, quantity, room, run";

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

struct JobRow {
    id: String,
    number: i64,
    name: String,
    customer: Option<String>,
    notes: Option<String>,
    status: String,
    rules_json: String,
    rules_version: i64,
    created_at: String,
    updated_at: String,
    revision: i64,
    materials_json: Option<String>,
}

fn read_job_row(row: &Row<'_>) -> rusqlite::Result<JobRow> {
    Ok(JobRow {
        id: row.get(0)?,
        number: row.get(1)?,
        name: row.get(2)?,
        customer: row.get(3)?,
        notes: row.get(4)?,
        status: row.get(5)?,
        rules_json: row.get(6)?,
        rules_version: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        revision: row.get(10)?,
        materials_json: row.get(11)?,
    })
}

struct CabinetRow {
    id: String,
    label: String,
    cabinet_type: String,
    width: i64,
    height: i64,
    depth: i64,
    shelf_count: i64,
    finished_ends: String,
    quantity: i64,
    room: Option<String>,
    run: Option<String>,
}

fn read_cabinet_row(row: &Row<'_>) -> rusqlite::Result<CabinetRow> {
    Ok(CabinetRow {
        id: row.get(0)?,
        label: row.get(1)?,
        cabinet_type: row.get(2)?,
        width: row.get(3)?,
        height: row.get(4)?,
        depth: row.get(5)?,
        shelf_count: row.get(6)?,
        finished_ends: row.get(7)?,
        quantity: row.get(8)?,
        room: row.get(9)?,
        run: row.get(10)?,
    })
}

impl CabinetRow {
    fn into_cabinet(self) -> DbResult<Cabinet> {
        Ok(Cabinet {
            id: self.id,
            label: self.label,
            cabinet_type: CabinetType::parse(&self.cabinet_type)?,
            width: self.width,
            height: self.height,
            depth: self.depth,
            shelf_count: self.shelf_count,
            finished_ends: FinishedEnds::parse(&self.finished_ends)?,
            quantity: self.quantity,
            room: self.room,
            run: self.run,
        })
    }
}

/// All jobs, most recently changed first, with cabinet outlines for thumbnails.
pub fn list_jobs(conn: &Connection) -> DbResult<Vec<JobListItem>> {
    let mut outlines: HashMap<String, Vec<CabinetOutline>> = HashMap::new();
    {
        let mut stmt = conn.prepare(
            "SELECT job_id, label, type, width, height, depth, quantity
             FROM cabinets ORDER BY job_id, position, rowid",
        )?;
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let job_id: String = row.get(0)?;
            let type_text: String = row.get(2)?;
            outlines.entry(job_id).or_default().push(CabinetOutline {
                label: row.get(1)?,
                cabinet_type: CabinetType::parse(&type_text)?,
                width: row.get(3)?,
                height: row.get(4)?,
                depth: row.get(5)?,
                quantity: row.get(6)?,
            });
        }
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT {JOB_COLUMNS} FROM jobs ORDER BY updated_at DESC, number DESC"
    ))?;
    let rows = stmt.query_map([], read_job_row)?;
    let mut jobs = Vec::new();
    for row in rows {
        let row = row?;
        let cabinets = outlines.remove(&row.id).unwrap_or_default();
        jobs.push(JobListItem {
            status: JobStatus::parse(&row.status)?,
            cabinet_count: cabinets.len() as i64,
            cabinets,
            id: row.id,
            number: row.number,
            name: row.name,
            customer: row.customer,
            notes: row.notes,
            created_at: row.created_at,
            updated_at: row.updated_at,
            revision: row.revision,
        });
    }
    Ok(jobs)
}

pub fn get_job(conn: &Connection, id: &str) -> DbResult<Job> {
    let row = conn
        .query_row(&format!("SELECT {JOB_COLUMNS} FROM jobs WHERE id = ?1"), [id], read_job_row)
        .optional()?
        .ok_or(DbError::JobNotFound)?;
    let cabinets = load_cabinets(conn, id)?;
    Ok(Job {
        status: JobStatus::parse(&row.status)?,
        rules: serde_json::from_str(&row.rules_json)?,
        id: row.id,
        number: row.number,
        name: row.name,
        customer: row.customer,
        notes: row.notes,
        rules_version: row.rules_version,
        created_at: row.created_at,
        updated_at: row.updated_at,
        revision: row.revision,
        cabinets,
        materials: row.materials_json.as_deref().map(serde_json::from_str).transpose()?,
    })
}

fn load_cabinets(conn: &Connection, job_id: &str) -> DbResult<Vec<Cabinet>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CABINET_COLUMNS} FROM cabinets WHERE job_id = ?1 ORDER BY position, rowid"
    ))?;
    let rows = stmt.query_map([job_id], read_cabinet_row)?;
    let mut cabinets = Vec::new();
    for row in rows {
        cabinets.push(row?.into_cabinet()?);
    }
    Ok(cabinets)
}

fn cabinet_order(conn: &Connection, job_id: &str) -> DbResult<Vec<String>> {
    let mut stmt =
        conn.prepare("SELECT id FROM cabinets WHERE job_id = ?1 ORDER BY position, rowid")?;
    let rows = stmt.query_map([job_id], |row| row.get::<_, String>(0))?;
    let mut ids = Vec::new();
    for id in rows {
        ids.push(id?);
    }
    Ok(ids)
}

// ---------------------------------------------------------------------------
// Helpers shared by the writers
// ---------------------------------------------------------------------------

pub(crate) fn now(conn: &Connection) -> DbResult<String> {
    Ok(conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| row.get(0))?)
}

pub(crate) fn fresh_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub(crate) fn next_job_number(conn: &Connection) -> DbResult<i64> {
    Ok(conn.query_row("SELECT COALESCE(MAX(number), 0) + 1 FROM jobs", [], |row| row.get(0))?)
}

/// Blank optional text is stored as NULL.
fn optional_text(value: &Option<String>) -> Option<&str> {
    value.as_deref().filter(|text| !text.trim().is_empty())
}

fn ensure_job(conn: &Connection, job_id: &str) -> DbResult<()> {
    let exists: bool =
        conn.query_row("SELECT EXISTS (SELECT 1 FROM jobs WHERE id = ?1)", [job_id], |row| {
            row.get(0)
        })?;
    if exists {
        Ok(())
    } else {
        Err(DbError::JobNotFound)
    }
}

/// Bump revision and updated_at. Call last in every transaction that changes a job.
fn touch_job(conn: &Connection, job_id: &str) -> DbResult<Saved> {
    let updated_at = now(conn)?;
    let changed = conn.execute(
        "UPDATE jobs SET revision = revision + 1, updated_at = ?2 WHERE id = ?1",
        params![job_id, updated_at],
    )?;
    if changed == 0 {
        return Err(DbError::JobNotFound);
    }
    let revision = conn.query_row("SELECT revision FROM jobs WHERE id = ?1", [job_id], |row| {
        row.get(0)
    })?;
    Ok(Saved { revision, updated_at })
}

pub(crate) struct JobInsert<'a> {
    pub id: &'a str,
    pub number: i64,
    pub name: &'a str,
    pub customer: Option<&'a str>,
    pub notes: Option<&'a str>,
    pub status: JobStatus,
    pub rules_json: &'a str,
    pub rules_version: i64,
    pub now: &'a str,
    /// The job's materials JSON; None for a job without (made before materials).
    pub materials_json: Option<&'a str>,
}

pub(crate) fn insert_job(conn: &Connection, job: &JobInsert<'_>) -> DbResult<()> {
    conn.execute(
        "INSERT INTO jobs (id, number, name, customer, notes, status, rules_json, rules_version,
                           created_at, updated_at, revision, materials_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, 0, ?10)",
        params![
            job.id,
            job.number,
            job.name,
            job.customer,
            job.notes,
            job.status.as_str(),
            job.rules_json,
            job.rules_version,
            job.now,
            job.materials_json,
        ],
    )?;
    Ok(())
}

/// Insert or update one cabinet row. Refuses an id that belongs to another job.
pub(crate) fn write_cabinet(
    conn: &Connection,
    job_id: &str,
    position: i64,
    cabinet: &Cabinet,
) -> DbResult<()> {
    let owner: Option<String> = conn
        .query_row("SELECT job_id FROM cabinets WHERE id = ?1", [&cabinet.id], |row| row.get(0))
        .optional()?;
    if owner.is_some_and(|owner| owner != job_id) {
        return Err(DbError::invalid(format!(
            "Cabinet {} belongs to a different job.",
            cabinet.label
        )));
    }
    conn.execute(
        "INSERT INTO cabinets (id, job_id, position, label, type, width, height, depth,
                               shelf_count, finished_ends, quantity, room, run)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT (id) DO UPDATE SET
           position = excluded.position, label = excluded.label, type = excluded.type,
           width = excluded.width, height = excluded.height, depth = excluded.depth,
           shelf_count = excluded.shelf_count, finished_ends = excluded.finished_ends,
           quantity = excluded.quantity, room = excluded.room, run = excluded.run",
        params![
            cabinet.id,
            job_id,
            position,
            cabinet.label,
            cabinet.cabinet_type.as_str(),
            cabinet.width,
            cabinet.height,
            cabinet.depth,
            cabinet.shelf_count,
            cabinet.finished_ends.as_str(),
            cabinet.quantity,
            optional_text(&cabinet.room),
            optional_text(&cabinet.run),
        ],
    )?;
    Ok(())
}

fn renumber(conn: &Connection, job_id: &str, order: &[String]) -> DbResult<()> {
    let mut stmt =
        conn.prepare("UPDATE cabinets SET position = ?3 WHERE job_id = ?1 AND id = ?2")?;
    for (position, id) in order.iter().enumerate() {
        stmt.execute(params![job_id, id, position as i64])?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/// The rules a new job snapshots: the shop's saved defaults, or the built-in ones.
/// Always in the current shape (`RULES_VERSION`), since the job is stamped with it.
pub fn current_rules(conn: &Connection) -> DbResult<serde_json::Value> {
    let stored: Option<String> = conn
        .query_row("SELECT value_json FROM shop_settings WHERE key = ?1", [RULES_SETTING], |row| {
            row.get(0)
        })
        .optional()?;
    upgrade_shop_rules(serde_json::from_str(stored.as_deref().unwrap_or(DEFAULT_RULES_JSON))?)
}

/// Shop defaults saved before construction methods (rules version 1) have no
/// `method` block. They gain the built-in one, so new jobs made from them get
/// the default method with the base listed. Jobs keep their own snapshots.
pub fn upgrade_shop_rules(mut rules: serde_json::Value) -> DbResult<serde_json::Value> {
    if let Some(object) = rules.as_object_mut() {
        if !object.contains_key("method") {
            let defaults: serde_json::Value = serde_json::from_str(DEFAULT_RULES_JSON)?;
            object.insert("method".into(), defaults["method"].clone());
        }
    }
    Ok(rules)
}

/// Apply the New job dialog's construction choice to a rules snapshot. Only the
/// method and (for method A) the base type change; every other setting stays
/// the shop's, as the app's `applyConstructionChoice` does.
pub fn with_construction(mut rules: serde_json::Value, choice: ConstructionChoice) -> DbResult<serde_json::Value> {
    let method = rules
        .get_mut("method")
        .and_then(serde_json::Value::as_object_mut)
        .ok_or_else(|| DbError::Corrupt("shop rules have no method block".into()))?;
    method.insert("id".into(), choice.id.as_str().into());
    if choice.id == MethodId::A {
        method.insert("baseType".into(), choice.base_type.as_str().into());
    }
    Ok(rules)
}

/// Create an empty draft job that snapshots the current shop rules, with the
/// construction chosen for it.
pub fn create_job(conn: &mut Connection, new_job: &NewJob) -> DbResult<Job> {
    let name = new_job.name.trim();
    if name.is_empty() {
        return Err(DbError::invalid("A job needs a name."));
    }
    if let Some(materials) = &new_job.materials {
        check_job_materials(materials)?;
    }
    let materials = new_job.materials.as_ref().map(serde_json::Value::to_string);
    let id = fresh_id();
    let tx = conn.transaction()?;
    let mut rules = current_rules(&tx)?;
    if let Some(choice) = new_job.construction {
        rules = with_construction(rules, choice)?;
    }
    let rules = rules.to_string();
    let number = next_job_number(&tx)?;
    let now = now(&tx)?;
    insert_job(
        &tx,
        &JobInsert {
            id: &id,
            number,
            name,
            customer: optional_text(&new_job.customer),
            notes: optional_text(&new_job.notes),
            status: JobStatus::Draft,
            rules_json: &rules,
            rules_version: RULES_VERSION,
            now: &now,
            materials_json: materials.as_deref(),
        },
    )?;
    tx.commit()?;
    get_job(conn, &id)
}

/// A fully independent copy: new id, next number, "(copy)", draft, new cabinet
/// ids, and the source job's own rules snapshot (not the current shop defaults).
pub fn duplicate_job(conn: &mut Connection, id: &str) -> DbResult<Job> {
    let copy_id = fresh_id();
    let tx = conn.transaction()?;
    let source = get_job(&tx, id)?;
    let number = next_job_number(&tx)?;
    let now = now(&tx)?;
    let name = format!("{} (copy)", source.name);
    let rules = source.rules.to_string();
    let materials = source.materials.as_ref().map(serde_json::Value::to_string);
    insert_job(
        &tx,
        &JobInsert {
            id: &copy_id,
            number,
            name: &name,
            customer: optional_text(&source.customer),
            notes: optional_text(&source.notes),
            status: JobStatus::Draft,
            rules_json: &rules,
            rules_version: source.rules_version,
            now: &now,
            materials_json: materials.as_deref(),
        },
    )?;
    for (position, cabinet) in source.cabinets.iter().enumerate() {
        let copy = Cabinet { id: fresh_id(), ..cabinet.clone() };
        write_cabinet(&tx, &copy_id, position as i64, &copy)?;
    }
    tx.commit()?;
    get_job(conn, &copy_id)
}

pub fn update_job_fields(conn: &mut Connection, id: &str, fields: &JobFields) -> DbResult<Saved> {
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE jobs SET name = ?2, customer = ?3, notes = ?4 WHERE id = ?1",
        params![id, fields.name, optional_text(&fields.customer), optional_text(&fields.notes)],
    )?;
    if changed == 0 {
        return Err(DbError::JobNotFound);
    }
    let saved = touch_job(&tx, id)?;
    tx.commit()?;
    Ok(saved)
}

pub fn set_job_status(conn: &mut Connection, id: &str, status: JobStatus) -> DbResult<Saved> {
    let tx = conn.transaction()?;
    let changed =
        tx.execute("UPDATE jobs SET status = ?2 WHERE id = ?1", params![id, status.as_str()])?;
    if changed == 0 {
        return Err(DbError::JobNotFound);
    }
    let saved = touch_job(&tx, id)?;
    tx.commit()?;
    Ok(saved)
}

/// Delete a job. Its cabinets and any unsaved journal go with it (ON DELETE CASCADE).
pub fn delete_job(conn: &Connection, id: &str) -> DbResult<()> {
    if conn.execute("DELETE FROM jobs WHERE id = ?1", [id])? == 0 {
        return Err(DbError::JobNotFound);
    }
    Ok(())
}

/// Save everything the user edits in one transaction: job fields, status, and
/// the cabinet list (upserted in order; cabinets not listed are deleted). Also
/// clears the job's crash-recovery journal, since it is now saved.
pub fn save_job(conn: &mut Connection, snapshot: &JobSnapshot) -> DbResult<Saved> {
    snapshot.check()?;
    let tx = conn.transaction()?;
    let saved = save_snapshot(&tx, snapshot)?;
    tx.commit()?;
    Ok(saved)
}

/// The body of `save_job`, for callers that already hold a transaction.
pub(crate) fn save_snapshot(conn: &Connection, snapshot: &JobSnapshot) -> DbResult<Saved> {
    // Before the status is written: the lock reads the status the job had.
    if let Some(rules) = &snapshot.rules {
        save_rules(conn, snapshot, rules)?;
    }
    if let Some(materials) = &snapshot.materials {
        conn.execute(
            "UPDATE jobs SET materials_json = ?2 WHERE id = ?1",
            params![snapshot.id, materials.to_string()],
        )?;
    }
    let changed = conn.execute(
        "UPDATE jobs SET name = ?2, customer = ?3, notes = ?4, status = ?5 WHERE id = ?1",
        params![
            snapshot.id,
            snapshot.name,
            optional_text(&snapshot.customer),
            optional_text(&snapshot.notes),
            snapshot.status.as_str(),
        ],
    )?;
    if changed == 0 {
        return Err(DbError::JobNotFound);
    }

    let keep: HashSet<&str> = snapshot.cabinets.iter().map(|c| c.id.as_str()).collect();
    for id in cabinet_order(conn, &snapshot.id)? {
        if !keep.contains(id.as_str()) {
            conn.execute("DELETE FROM cabinets WHERE job_id = ?1 AND id = ?2", params![snapshot.id, id])?;
        }
    }
    for (position, cabinet) in snapshot.cabinets.iter().enumerate() {
        write_cabinet(conn, &snapshot.id, position as i64, cabinet)?;
    }
    conn.execute("DELETE FROM pending_edits WHERE job_id = ?1", [&snapshot.id])?;
    touch_job(conn, &snapshot.id)
}

/// A changed construction (the workspace's Construction control). Allowed only
/// while the job is a draft: it is one now, or this snapshot makes it one again
/// (an undo back past "Mark ready"). From ready to cut onward the cut list
/// must not move, so the rules are locked.
fn save_rules(conn: &Connection, snapshot: &JobSnapshot, rules: &serde_json::Value) -> DbResult<()> {
    let stored: Option<String> = conn
        .query_row("SELECT status FROM jobs WHERE id = ?1", [&snapshot.id], |row| row.get(0))
        .optional()?;
    let stored = JobStatus::parse(&stored.ok_or(DbError::JobNotFound)?)?;
    if stored != JobStatus::Draft && snapshot.status != JobStatus::Draft {
        return Err(DbError::invalid(
            "This job's construction is locked because it is no longer a draft. Duplicate the job to try another method.",
        ));
    }
    conn.execute(
        "UPDATE jobs SET rules_json = ?2, rules_version = ?3 WHERE id = ?1",
        params![snapshot.id, rules.to_string(), RULES_VERSION],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Cabinets
// ---------------------------------------------------------------------------

/// Add or replace one cabinet. `position` places it in the list (clamped);
/// without one, an existing cabinet keeps its place and a new one goes last.
pub fn upsert_cabinet(
    conn: &mut Connection,
    job_id: &str,
    cabinet: &Cabinet,
    position: Option<i64>,
) -> DbResult<Saved> {
    cabinet.check()?;
    let tx = conn.transaction()?;
    ensure_job(&tx, job_id)?;
    let mut order = cabinet_order(&tx, job_id)?;
    let existing = order.iter().position(|id| *id == cabinet.id);
    if let Some(index) = existing {
        order.remove(index);
    }
    let index = match (position, existing) {
        (Some(p), _) => p.clamp(0, order.len() as i64) as usize,
        (None, Some(index)) => index,
        (None, None) => order.len(),
    };
    order.insert(index, cabinet.id.clone());
    write_cabinet(&tx, job_id, index as i64, cabinet)?;
    renumber(&tx, job_id, &order)?;
    let saved = touch_job(&tx, job_id)?;
    tx.commit()?;
    Ok(saved)
}

/// Put the job's cabinets in this order. The list must name each cabinet once.
pub fn reorder_cabinets(conn: &mut Connection, job_id: &str, order: &[String]) -> DbResult<Saved> {
    let tx = conn.transaction()?;
    ensure_job(&tx, job_id)?;
    let current: HashSet<String> = cabinet_order(&tx, job_id)?.into_iter().collect();
    let requested: HashSet<String> = order.iter().cloned().collect();
    if requested.len() != order.len() || requested != current {
        return Err(DbError::invalid(
            "The new cabinet order doesn't match the job's cabinets. Reopen the job and try again.",
        ));
    }
    renumber(&tx, job_id, order)?;
    let saved = touch_job(&tx, job_id)?;
    tx.commit()?;
    Ok(saved)
}

pub fn delete_cabinet(conn: &mut Connection, job_id: &str, cabinet_id: &str) -> DbResult<Saved> {
    let tx = conn.transaction()?;
    ensure_job(&tx, job_id)?;
    let deleted = tx.execute(
        "DELETE FROM cabinets WHERE job_id = ?1 AND id = ?2",
        params![job_id, cabinet_id],
    )?;
    if deleted == 0 {
        return Err(DbError::CabinetNotFound);
    }
    let order = cabinet_order(&tx, job_id)?;
    renumber(&tx, job_id, &order)?;
    let saved = touch_job(&tx, job_id)?;
    tx.commit()?;
    Ok(saved)
}

// ---------------------------------------------------------------------------
// Shop settings
// ---------------------------------------------------------------------------

/// Every stored setting. Construction rules are always present (built-in defaults
/// until the shop saves its own).
pub fn get_shop_settings(conn: &Connection) -> DbResult<BTreeMap<String, serde_json::Value>> {
    let mut settings = BTreeMap::new();
    let mut stmt = conn.prepare("SELECT key, value_json FROM shop_settings")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    for row in rows {
        let (key, json) = row?;
        let value = serde_json::from_str(&json)?;
        let value = if key == RULES_SETTING { upgrade_shop_rules(value)? } else { value };
        settings.insert(key, value);
    }
    if !settings.contains_key(RULES_SETTING) {
        settings.insert(RULES_SETTING.to_string(), serde_json::from_str(DEFAULT_RULES_JSON)?);
    }
    Ok(settings)
}

/// Store one setting. Changing construction rules affects new jobs only; existing
/// jobs keep their own snapshot.
pub fn set_shop_setting(conn: &Connection, key: &str, value: &serde_json::Value) -> DbResult<()> {
    if !SHOP_SETTING_KEYS.contains(&key) {
        return Err(DbError::invalid(format!("\"{key}\" is not a shop setting.")));
    }
    if key == RULES_SETTING && !value.is_object() {
        return Err(DbError::invalid("Construction rules must be a set of named values."));
    }
    conn.execute(
        "INSERT INTO shop_settings (key, value_json) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json",
        params![key, value.to_string()],
    )?;
    Ok(())
}
