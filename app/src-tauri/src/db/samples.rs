//! Sample jobs for development only: the five from docs/wireframes/Home.dc.html,
//! the cut-list wireframe job, a 40-cabinet job for checking page breaks
//! (those two match engine/fixtures/cutlist/), and one job per construction
//! method to try: integral toe kick, and a ladder base under two runs.
//! Production databases start empty; the command refuses in release builds.
//! The same JSON seeds the in-memory store used by `npm run dev:web`.
//!
//! The example job is the one sample release builds have: offered on the empty
//! Jobs screen and in Settings → About (prompt 14).

use rusqlite::Connection;
use serde::Deserialize;

use super::error::DbResult;
use super::models::{
    BaseType, Cabinet, CabinetType, ConstructionChoice, FinishedEnds, Job, JobStatus, MethodId, RULES_VERSION,
};
use super::repo::{
    current_rules, fresh_id, get_job, insert_job, next_job_number, now, with_construction, write_cabinet, JobInsert,
};

pub const SAMPLE_JOBS_JSON: &str = include_str!("sample_jobs.json");
/// Base and wall cabinets, finished ends, quantities above 1, and one run.
pub const EXAMPLE_JOB_JSON: &str = include_str!("example_job.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SampleJob {
    /// None: the next free number.
    #[serde(default)]
    number: Option<i64>,
    name: String,
    customer: Option<String>,
    notes: Option<String>,
    status: JobStatus,
    /// None: the shop's default construction.
    #[serde(default)]
    construction: Option<SampleConstruction>,
    cabinets: Vec<SampleCabinet>,
}

/// A construction as the New job dialog names it.
#[derive(Clone, Copy, Deserialize)]
enum SampleConstruction {
    A1,
    A2,
    B,
}

impl SampleConstruction {
    fn choice(self) -> ConstructionChoice {
        match self {
            SampleConstruction::A1 => ConstructionChoice { id: MethodId::A, base_type: BaseType::Ladder },
            SampleConstruction::A2 => ConstructionChoice { id: MethodId::A, base_type: BaseType::Legs },
            SampleConstruction::B => ConstructionChoice { id: MethodId::B, base_type: BaseType::Ladder },
        }
    }
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
    #[serde(default)]
    run: Option<String>,
}

/// Whether these rules list a ladder base under runs (method A1), as the engine's `usesRuns`.
fn uses_runs(rules: &serde_json::Value) -> bool {
    let method = &rules["method"];
    method["id"] == "A" && method["baseType"] == "ladder" && method["listBase"] == true
}

/// Add one sample, snapshotting `shop` (with its own construction, if it has
/// one). A number already taken, or none, means the next free number. Without
/// `keep_runs`, runs are kept only when the job's construction uses them.
fn add_sample(conn: &Connection, sample: SampleJob, shop: &serde_json::Value, now: &str, keep_runs: bool) -> DbResult<String> {
    let number = match sample.number {
        Some(number) => {
            let taken: bool =
                conn.query_row("SELECT EXISTS (SELECT 1 FROM jobs WHERE number = ?1)", [number], |row| row.get(0))?;
            if taken { next_job_number(conn)? } else { number }
        }
        None => next_job_number(conn)?,
    };
    let id = fresh_id();
    let rules = match sample.construction {
        Some(construction) => with_construction(shop.clone(), construction.choice())?,
        None => shop.clone(),
    };
    let runs = keep_runs || uses_runs(&rules);
    insert_job(
        conn,
        &JobInsert {
            id: &id,
            number,
            name: &sample.name,
            customer: sample.customer.as_deref(),
            notes: sample.notes.as_deref(),
            status: sample.status,
            rules_json: &rules.to_string(),
            rules_version: RULES_VERSION,
            now,
            // The app gives them the shop's default materials and saw profile when they open.
            materials_json: None,
            saw_profile_json: None,
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
            run: if runs { c.run } else { None },
        };
        write_cabinet(conn, &id, position as i64, &cabinet)?;
    }
    Ok(id)
}

/// Add the sample jobs, snapshotting the current shop rules. A sample whose job
/// number is already taken gets the next free number instead.
pub fn load_sample_jobs(conn: &mut Connection) -> DbResult<Vec<Job>> {
    let samples: Vec<SampleJob> = serde_json::from_str(SAMPLE_JOBS_JSON)?;
    let tx = conn.transaction()?;
    let shop = current_rules(&tx)?;
    let now = now(&tx)?;
    let mut ids = Vec::new();
    for sample in samples {
        ids.push(add_sample(&tx, sample, &shop, &now, true)?);
    }
    tx.commit()?;
    ids.iter().map(|id| get_job(conn, id)).collect()
}

/// Add the example job: an ordinary draft with the next job number, built with
/// the current shop defaults. Its cabinets share a run only if the shop's
/// default construction uses runs. Each call adds another.
pub fn add_example_job(conn: &mut Connection) -> DbResult<Job> {
    let example: SampleJob = serde_json::from_str(EXAMPLE_JOB_JSON)?;
    let tx = conn.transaction()?;
    let shop = current_rules(&tx)?;
    let now = now(&tx)?;
    let id = add_sample(&tx, example, &shop, &now, false)?;
    tx.commit()?;
    get_job(conn, &id)
}
