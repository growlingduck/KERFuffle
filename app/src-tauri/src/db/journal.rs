//! Crash-recovery journal. The client writes the job's latest unsaved snapshot
//! here on every commit, before the debounced save. A successful save deletes
//! the row in the same transaction (`repo::save_snapshot`), so a row that is
//! still here at startup holds edits that never reached the job tables.

use rusqlite::{params, Connection};

use super::error::{DbError, DbResult};
use super::models::{JobSnapshot, RecoveredJob};
use super::repo::save_snapshot;

pub fn write_pending_edit(conn: &Connection, snapshot: &JobSnapshot, base_revision: i64) -> DbResult<()> {
    snapshot.check()?;
    let exists: bool =
        conn.query_row("SELECT EXISTS (SELECT 1 FROM jobs WHERE id = ?1)", [&snapshot.id], |row| {
            row.get(0)
        })?;
    if !exists {
        return Err(DbError::JobNotFound);
    }
    conn.execute(
        "INSERT INTO pending_edits (job_id, payload_json, base_revision, written_at)
         VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (job_id) DO UPDATE SET
           payload_json = excluded.payload_json,
           base_revision = excluded.base_revision,
           written_at = excluded.written_at",
        params![snapshot.id, serde_json::to_string(snapshot)?, base_revision],
    )?;
    Ok(())
}

/// Apply every journaled snapshot, each in its own transaction that also removes
/// the journal row, so each one is applied exactly once. A snapshot that can't be
/// applied is left in place (and logged) rather than thrown away.
pub fn recover_pending_edits(conn: &mut Connection) -> DbResult<Vec<RecoveredJob>> {
    let pending: Vec<(String, String)> = {
        let mut stmt =
            conn.prepare("SELECT job_id, payload_json FROM pending_edits ORDER BY written_at")?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
        let mut pending = Vec::new();
        for row in rows {
            pending.push(row?);
        }
        pending
    };

    let mut recovered = Vec::new();
    for (job_id, payload) in pending {
        let tx = conn.transaction()?;
        match apply_pending(&tx, &job_id, &payload) {
            Ok(job) => {
                tx.commit()?;
                recovered.push(job);
            }
            Err(error) => {
                drop(tx); // rolls back
                eprintln!("KERFuffle: couldn't recover unsaved changes for job {job_id}: {error}");
            }
        }
    }
    Ok(recovered)
}

fn apply_pending(conn: &Connection, job_id: &str, payload: &str) -> DbResult<RecoveredJob> {
    let snapshot: JobSnapshot = serde_json::from_str(payload)?;
    if snapshot.id != job_id {
        return Err(DbError::Corrupt(format!("journal row for {job_id} holds job {}", snapshot.id)));
    }
    snapshot.check()?;
    let saved = save_snapshot(conn, &snapshot)?;
    Ok(RecoveredJob {
        job_id: snapshot.id,
        job_name: snapshot.name,
        revision: saved.revision,
        updated_at: saved.updated_at,
    })
}
