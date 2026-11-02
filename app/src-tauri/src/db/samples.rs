//! Sample jobs for development only: the five from docs/wireframes/Home.dc.html,
//! the cut-list wireframe job, a 40-cabinet job for checking page breaks
//! (those two match engine/fixtures/cutlist/), and one job per construction
//! method to try: integral toe kick, and a ladder base under two runs.
//! Production databases start empty; the command refuses in release builds.
//! The same JSON seeds the in-memory store used by `npm run dev:web`.

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SampleJob {
    number: i64,
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

/// Add the sample jobs, snapshotting the current shop rules. A sample whose job
/// number is already taken gets the next free number instead.
pub fn load_sample_jobs(conn: &mut Connection) -> DbResult<Vec<Job>> {
    let samples: Vec<SampleJob> = serde_json::from_str(SAMPLE_JOBS_JSON)?;
    let tx = conn.transaction()?;
    let shop = current_rules(&tx)?;
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
        let rules = match sample.construction {
            Some(construction) => with_construction(shop.clone(), construction.choice())?,
            None => shop.clone(),
        }
        .to_string();
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
                // The app gives them the shop's default materials when they open.
                materials_json: None,
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
                run: c.run,
            };
            write_cabinet(&tx, &id, position as i64, &cabinet)?;
        }
        ids.push(id);
    }
    tx.commit()?;
    ids.iter().map(|id| get_job(conn, id)).collect()
}
