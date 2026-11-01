//! Tauri commands over the job database. Each returns `{ kind, message }` on
//! failure (see `db::DbError`); the TypeScript wrappers live in app/src/data/client.ts.
//!
//! Commands are `async` so they run off the main thread and never stall the window.

use std::collections::BTreeMap;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::db::{
    self, Cabinet, DbError, DbResult, Job, JobFields, JobListItem, JobSnapshot, JobStatus, NewJob,
    RecoveredJob, Saved,
};

/// The open database, or the reason it couldn't be opened (reported by every command).
pub struct DbState(Mutex<DbResult<Connection>>);

impl DbState {
    pub fn new(connection: DbResult<Connection>) -> Self {
        Self(Mutex::new(connection))
    }

    pub(crate) fn with<T>(&self, f: impl FnOnce(&mut Connection) -> DbResult<T>) -> DbResult<T> {
        let mut guard = self.0.lock().map_err(|_| {
            DbError::Unavailable("an earlier error interrupted it. Restart KERFuffle.".into())
        })?;
        match guard.as_mut() {
            Ok(conn) => f(conn),
            Err(error) => Err(error.clone()),
        }
    }

    /// The open database or why it isn't open, to close and replace it (restore).
    pub fn with_slot<T>(&self, f: impl FnOnce(&mut DbResult<Connection>) -> DbResult<T>) -> DbResult<T> {
        let mut guard = self.0.lock().map_err(|_| {
            DbError::Unavailable("an earlier error interrupted it. Restart KERFuffle.".into())
        })?;
        f(&mut guard)
    }
}

#[tauri::command]
pub async fn list_jobs(state: State<'_, DbState>) -> Result<Vec<JobListItem>, DbError> {
    state.with(|conn| db::list_jobs(conn))
}

#[tauri::command]
pub async fn get_job(state: State<'_, DbState>, id: String) -> Result<Job, DbError> {
    state.with(|conn| db::get_job(conn, &id))
}

#[tauri::command]
pub async fn create_job(state: State<'_, DbState>, job: NewJob) -> Result<Job, DbError> {
    state.with(|conn| db::create_job(conn, &job))
}

#[tauri::command]
pub async fn duplicate_job(state: State<'_, DbState>, id: String) -> Result<Job, DbError> {
    state.with(|conn| db::duplicate_job(conn, &id))
}

#[tauri::command]
pub async fn update_job_fields(
    state: State<'_, DbState>,
    id: String,
    fields: JobFields,
) -> Result<Saved, DbError> {
    state.with(|conn| db::update_job_fields(conn, &id, &fields))
}

#[tauri::command]
pub async fn set_job_status(
    state: State<'_, DbState>,
    id: String,
    status: JobStatus,
) -> Result<Saved, DbError> {
    state.with(|conn| db::set_job_status(conn, &id, status))
}

#[tauri::command]
pub async fn delete_job(state: State<'_, DbState>, id: String) -> Result<(), DbError> {
    state.with(|conn| db::delete_job(conn, &id))
}

#[tauri::command]
pub async fn save_job(state: State<'_, DbState>, job: JobSnapshot) -> Result<Saved, DbError> {
    state.with(|conn| db::save_job(conn, &job))
}

#[tauri::command]
pub async fn upsert_cabinet(
    state: State<'_, DbState>,
    job_id: String,
    cabinet: Cabinet,
    position: Option<i64>,
) -> Result<Saved, DbError> {
    state.with(|conn| db::upsert_cabinet(conn, &job_id, &cabinet, position))
}

#[tauri::command]
pub async fn reorder_cabinets(
    state: State<'_, DbState>,
    job_id: String,
    cabinet_ids: Vec<String>,
) -> Result<Saved, DbError> {
    state.with(|conn| db::reorder_cabinets(conn, &job_id, &cabinet_ids))
}

#[tauri::command]
pub async fn delete_cabinet(
    state: State<'_, DbState>,
    job_id: String,
    cabinet_id: String,
) -> Result<Saved, DbError> {
    state.with(|conn| db::delete_cabinet(conn, &job_id, &cabinet_id))
}

#[tauri::command]
pub async fn write_pending_edit(
    state: State<'_, DbState>,
    job: JobSnapshot,
    base_revision: i64,
) -> Result<(), DbError> {
    state.with(|conn| db::write_pending_edit(conn, &job, base_revision))
}

#[tauri::command]
pub async fn recover_pending_edits(state: State<'_, DbState>) -> Result<Vec<RecoveredJob>, DbError> {
    state.with(|conn| db::recover_pending_edits(conn))
}

#[tauri::command]
pub async fn get_shop_settings(
    state: State<'_, DbState>,
) -> Result<BTreeMap<String, serde_json::Value>, DbError> {
    state.with(|conn| db::get_shop_settings(conn))
}

#[tauri::command]
pub async fn set_shop_setting(
    state: State<'_, DbState>,
    key: String,
    value: serde_json::Value,
) -> Result<(), DbError> {
    state.with(|conn| db::set_shop_setting(conn, &key, &value))
}

/// Development builds only: add the sample jobs (see db/samples.rs).
#[tauri::command]
pub async fn dev_load_sample_jobs(state: State<'_, DbState>) -> Result<Vec<Job>, DbError> {
    if !cfg!(debug_assertions) {
        return Err(DbError::invalid("Sample jobs are only available in development builds."));
    }
    state.with(|conn| db::load_sample_jobs(conn))
}
