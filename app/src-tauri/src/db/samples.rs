//! Sample jobs for development only: the five from docs/wireframes/Home.dc.html,
//! the cut-list wireframe job and a 40-cabinet job for checking page breaks
//! (the last two match engine/fixtures/cutlist/).
//! Production databases start empty; the command refuses in release builds.
//! The same JSON seeds the in-memory store used by `npm run dev:web`.

use rusqlite::Connection;
use serde::Deserialize;

use super::error::DbResult;
use super::models::{Cabinet, CabinetType, FinishedEnds, Job, JobStatus, RULES_VERSION};
use super::repo::{current_rules, fresh_id, get_job, insert_job, next_job_number, now, write_cabinet, JobInsert};

pub const SAMPLE_JOBS_JSON: &str = include_str!("sample_jobs.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SampleJob {
    number: i64,
    name: String,
    customer: Option<String>,
    notes: Option<String>,
    status: JobStatus,
    cabinets: Vec<SampleCabinet>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SampleCabinet {
    label: String,
    #[serde(rename = "type")]
    cabinet_type: CabinetType,
    width: i64,
    height: i64,
    depth: i64,
    shelf_count: i64,
    finished_ends: FinishedEnds,
    quantity: i64,
}

/// Add the sample jobs, snapshotting the current shop rules. A sample whose job
/// number is already taken gets the next free number instead.
pub fn load_sample_jobs(conn: &mut Connection) -> DbResult<Vec<Job>> {
    let samples: Vec<SampleJob> = serde_json::from_str(SAMPLE_JOBS_JSON)?;
    let tx = conn.transaction()?;
    let rules = current_rules(&tx)?.to_string();
    let now = now(&tx)?;
    let mut ids = Vec::new();
    for sample in samples {
        let taken: bool = tx.query_row(
            "SELECT EXISTS (SELECT 1 FROM jobs WHERE number = ?1)",
            [sample.number],
            |row| row.get(0),
        )?;
        let number = if taken { next_job_number(&tx)? } else { sample.number };
        let id = fresh_id();
        insert_job(
            &tx,
            &JobInsert {
                id: &id,
                number,
                name: &sample.name,
                customer: sample.customer.as_deref(),
                notes: sample.notes.as_deref(),
                status: sample.status,
                rules_json: &rules,
                rules_version: RULES_VERSION,
                now: &now,
            },
        )?;
        for (position, c) in sample.cabinets.into_iter().enumerate() {
            let cabinet = Cabinet {
                id: fresh_id(),
                label: c.label,
                cabinet_type: c.cabinet_type,
                width: c.width,
                height: c.height,
                depth: c.depth,
                shelf_count: c.shelf_count,
                finished_ends: c.finished_ends,
                quantity: c.quantity,
                room: None,
            };
            write_cabinet(&tx, &id, position as i64, &cabinet)?;
        }
        ids.push(id);
    }
    tx.commit()?;
    ids.iter().map(|id| get_job(conn, id)).collect()
}
