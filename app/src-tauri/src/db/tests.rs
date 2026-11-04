use rusqlite::Connection;
use serde_json::json;

use super::*;

fn db() -> Connection {
    open_in_memory().expect("in-memory database")
}

fn cabinet(id: &str, label: &str) -> Cabinet {
    Cabinet {
        id: id.into(),
        label: label.into(),
        cabinet_type: CabinetType::Base,
        width: 1920,
        height: 2208,
        depth: 1536,
        shelf_count: 1,
        finished_ends: FinishedEnds::None,
        quantity: 1,
        room: None,
        run: None,
    }
}

fn new_job(conn: &mut Connection, name: &str) -> Job {
    create_job(conn, &NewJob { name: name.into(), customer: None, notes: None, construction: None, materials: None, saw_profile: None, cabinets: Vec::new() }).unwrap()
}

fn snapshot(job: &Job, cabinets: Vec<Cabinet>) -> JobSnapshot {
    JobSnapshot {
        id: job.id.clone(),
        name: job.name.clone(),
        customer: job.customer.clone(),
        notes: job.notes.clone(),
        status: job.status,
        cabinets,
        rules: None,
        materials: None,
        saw_profile: None,
    }
}

fn policy(dir: &std::path::Path) -> BackupPolicy {
    BackupPolicy { dir: dir.join("Backups"), keep: 14 }
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |row| row.get(0)).unwrap()
}

fn schema(conn: &Connection) -> Vec<(String, String)> {
    let mut stmt = conn
        .prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name")
        .unwrap();
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .unwrap();
    rows.map(|row| {
        let (name, sql) = row.unwrap();
        (name, sql.split_whitespace().collect::<Vec<_>>().join(" "))
    })
    .collect()
}

// --- Migrations ------------------------------------------------------------

#[test]
fn latest_version_matches_the_migration_list() {
    let versions = migrations::listed_versions();
    assert_eq!(versions, (1..=LATEST_VERSION).collect::<Vec<_>>());
}

#[test]
fn migrates_an_empty_database_then_rerunning_is_a_no_op() {
    let mut conn = Connection::open_in_memory().unwrap();
    assert_eq!(schema_version(&conn).unwrap(), 0);

    let first = migrate(&mut conn, None).unwrap();
    assert_eq!((first.from_version, first.to_version), (0, LATEST_VERSION));
    assert_eq!(schema_version(&conn).unwrap(), LATEST_VERSION);
    let after_first = schema(&conn);
    let created_at: String =
        conn.query_row("SELECT value FROM meta WHERE key = 'created_at'", [], |r| r.get(0)).unwrap();

    let second = migrate(&mut conn, None).unwrap();
    assert_eq!(
        second,
        MigrationReport { from_version: LATEST_VERSION, to_version: LATEST_VERSION, backup: None }
    );
    assert_eq!(schema(&conn), after_first);
    let created_again: String =
        conn.query_row("SELECT value FROM meta WHERE key = 'created_at'", [], |r| r.get(0)).unwrap();
    assert_eq!(created_again, created_at);
}

#[test]
fn file_database_uses_wal_and_foreign_keys_and_records_its_version() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(DB_FILE_NAME);
    let (conn, report) = open(&path, Some(&policy(dir.path()))).unwrap();
    assert_eq!(report.backup, None, "a brand-new database needs no backup");
    let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
    assert_eq!(mode.to_lowercase(), "wal");
    assert_eq!(count(&conn, "PRAGMA foreign_keys"), 1);
    assert_eq!(count(&conn, "PRAGMA synchronous"), 1); // NORMAL
    let version: String =
        conn.query_row("SELECT value FROM meta WHERE key = 'schema_version'", [], |r| r.get(0)).unwrap();
    assert_eq!(version, LATEST_VERSION.to_string());
    drop(conn);

    // Reopening an up-to-date database doesn't back it up either.
    let (_conn, report) = open(&path, Some(&policy(dir.path()))).unwrap();
    assert_eq!(report.backup, None);
}

#[test]
fn backs_up_an_existing_database_before_migrating_it() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(DB_FILE_NAME);
    {
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE scratch (x); INSERT INTO scratch VALUES (42);").unwrap();
    }
    let backups = policy(dir.path());
    let (_conn, report) = open(&path, Some(&backups)).unwrap();
    let backup = report.backup.expect("a pre-migration copy");
    assert!(backup.starts_with(&backups.dir));
    assert!(backup::BackupName::parse(&backup.file_name().unwrap().to_string_lossy()).is_some(), "named like every other backup");
    let copy = Connection::open(&backup).unwrap();
    assert_eq!(count(&copy, "SELECT x FROM scratch"), 42);
    assert_eq!(schema_version(&copy).unwrap(), 0, "the copy is from before the migration");
}

#[test]
fn refuses_a_database_from_a_newer_version() {
    let mut conn = db();
    conn.execute("UPDATE meta SET value = '99' WHERE key = 'schema_version'", []).unwrap();
    let error = migrate(&mut conn, None).unwrap_err();
    assert!(matches!(error, DbError::NewerSchema { found: 99, .. }));
    assert_eq!(error.kind(), "newerDatabase");
}

#[test]
fn version_1_fixture_matches_the_migrated_schema_and_its_data_reads_back() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    conn.execute_batch(include_str!("fixtures/schema_v1.sql")).unwrap();
    assert_eq!(schema_version(&conn).unwrap(), 1);
    let fresh_v1 = Connection::open_in_memory().unwrap();
    fresh_v1.execute_batch(&migrations::sql_through(1)).unwrap();
    assert_eq!(schema(&conn), schema(&fresh_v1), "fixture schema must equal a fresh v1 database");

    // Bring it up to date; every later migration must keep this data.
    migrate(&mut conn, None).unwrap();
    assert_eq!(schema(&conn), schema(&db()), "a migrated v1 database must equal a fresh one");
    let jobs = list_jobs(&conn).unwrap();
    assert_eq!(jobs.iter().map(|j| j.number).collect::<Vec<_>>(), vec![14, 11]);
    let kitchen = get_job(&conn, "fixture-job-1").unwrap();
    assert_eq!(kitchen.revision, 7);
    assert_eq!(kitchen.customer.as_deref(), Some("Pat Example"));
    assert_eq!(kitchen.rules["panelThickness"], json!(48));
    assert_eq!(kitchen.cabinets.len(), 2);
    assert_eq!(kitchen.cabinets[0].room.as_deref(), Some("Kitchen"));
    assert_eq!(kitchen.cabinets[1].finished_ends, FinishedEnds::Both);
    assert_eq!(current_rules(&conn).unwrap()["panelThickness"], json!(46));

    let recovered = recover_pending_edits(&mut conn).unwrap();
    assert_eq!(recovered.len(), 1);
    let vanity = get_job(&conn, "fixture-job-2").unwrap();
    assert_eq!(vanity.notes.as_deref(), Some("Recovered"));
    assert_eq!(vanity.cabinets[0].shelf_count, 1);
    assert_eq!(vanity.revision, 4);
}

#[test]
fn migration_2_adds_cabinet_runs_to_a_version_1_database_with_jobs_in_it() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    conn.execute_batch(include_str!("fixtures/schema_v1.sql")).unwrap();
    let report = migrate(&mut conn, None).unwrap();
    assert_eq!((report.from_version, report.to_version), (1, LATEST_VERSION));
    assert_eq!(schema_version(&conn).unwrap(), LATEST_VERSION);

    // Existing cabinets have no run; everything else reads back as it was.
    let kitchen = get_job(&conn, "fixture-job-1").unwrap();
    assert!(kitchen.cabinets.iter().all(|c| c.run.is_none()));
    assert_eq!(kitchen.cabinets[0].room.as_deref(), Some("Kitchen"));
    assert_eq!(kitchen.cabinets[1].quantity, 2);

    // Job rules snapshots stay version 1, untouched: the app upgrades them when it reads them.
    assert_eq!(kitchen.rules_version, 1);
    assert!(kitchen.rules.get("method").is_none());
    assert_eq!(kitchen.rules["panelThickness"], json!(48));

    // The shop's v1 defaults gain the default method (base listed) for new jobs, keeping their own values.
    let shop = current_rules(&conn).unwrap();
    assert_eq!(shop["panelThickness"], json!(46));
    assert_eq!(shop["method"]["id"], json!("A"));
    assert_eq!(shop["method"]["listBase"], json!(true));
    assert_eq!(get_shop_settings(&conn).unwrap()[RULES_SETTING], shop);
    let fresh = new_job(&mut conn, "After the upgrade");
    assert_eq!((fresh.rules_version, &fresh.rules), (RULES_VERSION, &shop));

    // A run can be saved and read back; a blank one is stored as none.
    let mut cabinets = kitchen.cabinets.clone();
    cabinets[0].run = Some("Sink wall".into());
    cabinets[1].run = Some("   ".into());
    save_job(&mut conn, &snapshot(&kitchen, cabinets)).unwrap();
    let saved = get_job(&conn, "fixture-job-1").unwrap();
    assert_eq!(saved.cabinets[0].run.as_deref(), Some("Sink wall"));
    assert_eq!(saved.cabinets[1].run, None);

    // The crash-recovery journal from v1 (no run in its payload) still recovers.
    assert_eq!(recover_pending_edits(&mut conn).unwrap().len(), 1);
    assert_eq!(get_job(&conn, "fixture-job-2").unwrap().cabinets[0].run, None);
}

#[test]
fn a_version_1_job_file_still_imports_and_keeps_its_snapshot() {
    let mut conn = db();
    let job = new_job(&mut conn, "Kitchen remodel");
    let mut old = exported(&job);
    old.id = "from-an-older-pc".into();
    old.number = 40;
    old.rules_version = 1;
    old.rules = json!({ "panelThickness": 48, "toeKickHeight": 256 });
    let imported = import_job(&mut conn, &old, ImportMode::New).unwrap();
    assert_eq!((imported.rules_version, &imported.rules), (1, &old.rules));
}

// --- Jobs and cabinets -------------------------------------------------------

#[test]
fn a_new_database_is_empty() {
    let conn = db();
    assert!(list_jobs(&conn).unwrap().is_empty());
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM shop_settings"), 0);
}

#[test]
fn creates_jobs_with_sequential_numbers_and_the_shop_rules() {
    let mut conn = db();
    let first = new_job(&mut conn, "  Kitchen remodel ");
    let second = new_job(&mut conn, "Laundry");
    assert_eq!(first.name, "Kitchen remodel");
    assert_eq!((first.number, second.number), (1, 2));
    assert_eq!(first.status, JobStatus::Draft);
    assert_eq!(first.revision, 0);
    assert_eq!(first.rules_version, RULES_VERSION);
    let defaults: serde_json::Value = serde_json::from_str(DEFAULT_RULES_JSON).unwrap();
    assert_eq!(first.rules, defaults);
    assert!(first.cabinets.is_empty());

    let error = create_job(&mut conn, &NewJob { name: "   ".into(), ..Default::default() }).unwrap_err();
    assert_eq!(error.kind(), "invalid");
}

#[test]
fn creates_a_job_with_its_first_cabinet() {
    let mut conn = db();
    let job = create_job(&mut conn, &NewJob { name: "Kitchen".into(), cabinets: vec![cabinet("c1", "B1")], ..Default::default() }).unwrap();
    assert_eq!(job.cabinets, vec![cabinet("c1", "B1")]);
    assert_eq!(list_jobs(&conn).unwrap()[0].cabinet_count, 1);

    // A bad cabinet rejects the whole job: nothing is half-created.
    let bad = Cabinet { id: " ".into(), ..cabinet("c2", "B1") };
    let error = create_job(&mut conn, &NewJob { name: "Bath".into(), cabinets: vec![bad], ..Default::default() }).unwrap_err();
    assert_eq!(error.kind(), "invalid");
    let twice = vec![cabinet("c3", "B1"), cabinet("c3", "B2")];
    assert_eq!(create_job(&mut conn, &NewJob { name: "Bath".into(), cabinets: twice, ..Default::default() }).unwrap_err().kind(), "invalid");
    assert_eq!(list_jobs(&conn).unwrap().len(), 1);
}

#[test]
fn round_trips_every_field() {
    let mut conn = db();
    let job = create_job(
        &mut conn,
        &NewJob { name: "Kitchen".into(), customer: Some("Pat".into()), notes: Some("Uppers?".into()), construction: None, materials: None, saw_profile: None, cabinets: Vec::new() },
    )
    .unwrap();
    let cabinets = vec![
        Cabinet {
            id: "c1".into(),
            label: "B1".into(),
            cabinet_type: CabinetType::Base,
            width: 1920,
            height: 2208,
            depth: 1536,
            shelf_count: 0,
            finished_ends: FinishedEnds::Left,
            quantity: 3,
            room: Some("Kitchen".into()),
            run: Some("Sink wall".into()),
        },
        Cabinet {
            id: "c2".into(),
            label: "W1".into(),
            cabinet_type: CabinetType::Wall,
            width: 1953,
            height: 1920,
            depth: 768,
            shelf_count: 2,
            finished_ends: FinishedEnds::Both,
            quantity: 1,
            room: None,
            run: None,
        },
        Cabinet { finished_ends: FinishedEnds::Right, ..cabinet("c3", "B2") },
        Cabinet { width: 0, quantity: 0, ..cabinet("c4", "") }, // in progress: allowed
    ];
    let snap = JobSnapshot {
        id: job.id.clone(),
        name: "Kitchen remodel".into(),
        customer: Some("Pat Example".into()),
        notes: Some("Island deferred.\nUppers to ceiling?".into()),
        status: JobStatus::Ready,
        cabinets: cabinets.clone(),
        rules: None,
        materials: None,
        saw_profile: None,
    };
    let saved = save_job(&mut conn, &snap).unwrap();
    assert_eq!(saved.revision, 1);

    let loaded = get_job(&conn, &job.id).unwrap();
    assert_eq!(loaded.name, snap.name);
    assert_eq!(loaded.customer, snap.customer);
    assert_eq!(loaded.notes, snap.notes);
    assert_eq!(loaded.status, JobStatus::Ready);
    assert_eq!(loaded.cabinets, cabinets);
    assert_eq!(loaded.revision, 1);
    assert_eq!(loaded.updated_at, saved.updated_at);
    assert_eq!(loaded.created_at, job.created_at);
    assert_eq!(loaded.number, job.number);
    assert_eq!(loaded.rules, job.rules);

    // Every status survives.
    for status in [JobStatus::Draft, JobStatus::Ready, JobStatus::Completed, JobStatus::Archived] {
        set_job_status(&mut conn, &job.id, status).unwrap();
        assert_eq!(get_job(&conn, &job.id).unwrap().status, status);
    }

    // Blank optional text is stored as NULL.
    update_job_fields(&mut conn, &job.id, &JobFields { name: "K".into(), customer: Some("  ".into()), notes: None })
        .unwrap();
    let loaded = get_job(&conn, &job.id).unwrap();
    assert_eq!((loaded.customer, loaded.notes), (None, None));

    // The wire format is camelCase with "type".
    let wire = serde_json::to_value(&loaded.cabinets[0]).unwrap();
    assert_eq!(wire["type"], json!("base"));
    assert_eq!(wire["shelfCount"], json!(0));
    assert_eq!(wire["finishedEnds"], json!("left"));
}

#[test]
fn save_replaces_the_cabinet_list_in_order_and_bumps_revision_once() {
    let mut conn = db();
    let job = new_job(&mut conn, "Job");
    save_job(&mut conn, &snapshot(&job, vec![cabinet("a", "B1"), cabinet("b", "B2"), cabinet("c", "B3")]))
        .unwrap();
    let saved =
        save_job(&mut conn, &snapshot(&job, vec![cabinet("c", "B3"), cabinet("a", "B1x")])).unwrap();
    assert_eq!(saved.revision, 2);
    let loaded = get_job(&conn, &job.id).unwrap();
    let labels: Vec<_> = loaded.cabinets.iter().map(|c| c.label.as_str()).collect();
    assert_eq!(labels, ["B3", "B1x"]);
}

#[test]
fn upserts_reorders_and_deletes_cabinets() {
    let mut conn = db();
    let job = new_job(&mut conn, "Job");
    upsert_cabinet(&mut conn, &job.id, &cabinet("a", "B1"), None).unwrap();
    upsert_cabinet(&mut conn, &job.id, &cabinet("b", "B2"), None).unwrap();
    upsert_cabinet(&mut conn, &job.id, &cabinet("c", "B3"), Some(0)).unwrap();
    let labels = |conn: &Connection| -> Vec<String> {
        get_job(conn, &job.id).unwrap().cabinets.into_iter().map(|c| c.label).collect()
    };
    assert_eq!(labels(&conn), ["B3", "B1", "B2"]);

    // Updating keeps the place unless a position is given.
    upsert_cabinet(&mut conn, &job.id, &Cabinet { width: 2304, ..cabinet("a", "B1") }, None).unwrap();
    assert_eq!(labels(&conn), ["B3", "B1", "B2"]);
    assert_eq!(get_job(&conn, &job.id).unwrap().cabinets[1].width, 2304);

    let saved = reorder_cabinets(&mut conn, &job.id, &["b".to_string(), "a".to_string(), "c".to_string()]).unwrap();
    assert_eq!(labels(&conn), ["B2", "B1", "B3"]);
    assert_eq!(saved.revision, 5);

    let error = reorder_cabinets(&mut conn, &job.id, &["b".to_string(), "a".to_string()]).unwrap_err();
    assert_eq!(error.kind(), "invalid");

    delete_cabinet(&mut conn, &job.id, "a").unwrap();
    assert_eq!(labels(&conn), ["B2", "B3"]);
    assert_eq!(delete_cabinet(&mut conn, &job.id, "a").unwrap_err().kind(), "notFound");

    // A cabinet id from another job is refused rather than moved.
    let other = new_job(&mut conn, "Other");
    let error = upsert_cabinet(&mut conn, &other.id, &cabinet("b", "B9"), None).unwrap_err();
    assert_eq!(error.kind(), "invalid");
}

#[test]
fn rejects_impossible_data() {
    let mut conn = db();
    let job = new_job(&mut conn, "Job");
    for bad in [
        Cabinet { width: -1, ..cabinet("a", "B1") },
        Cabinet { depth: -64, ..cabinet("a", "B1") },
        Cabinet { shelf_count: -1, ..cabinet("a", "B1") },
        Cabinet { quantity: -2, ..cabinet("a", "B1") },
        Cabinet { height: MAX_TICKS + 1, ..cabinet("a", "B1") },
        Cabinet { id: " ".into(), ..cabinet("a", "B1") },
    ] {
        let error = save_job(&mut conn, &snapshot(&job, vec![bad.clone()])).unwrap_err();
        assert_eq!(error.kind(), "invalid", "{bad:?}");
        assert!(upsert_cabinet(&mut conn, &job.id, &bad, None).is_err());
    }
    let error =
        save_job(&mut conn, &snapshot(&job, vec![cabinet("a", "B1"), cabinet("a", "B1")])).unwrap_err();
    assert_eq!(error.kind(), "invalid");
    assert_eq!(get_job(&conn, &job.id).unwrap().revision, 0, "nothing was written");

    // Unknown enum values never get past deserialization at the command boundary...
    let wire = json!({ "id": "a", "label": "B1", "type": "tall", "width": 1, "height": 1, "depth": 1,
                       "shelfCount": 0, "finishedEnds": "none", "quantity": 1 });
    assert!(serde_json::from_value::<Cabinet>(wire).is_err());
    assert!(serde_json::from_value::<JobStatus>(json!("deleted")).is_err());
    // ...and the table CHECKs stop them at the database too.
    let error = conn
        .execute(
            "INSERT INTO cabinets (id, job_id, position, label, type, width, height, depth, shelf_count, finished_ends, quantity)
             VALUES ('x', ?1, 0, 'X', 'tall', 1, 1, 1, 0, 'none', 1)",
            [&job.id],
        )
        .unwrap_err();
    assert_eq!(DbError::from(error).kind(), "invalid");
}

#[test]
fn missing_jobs_report_not_found() {
    let mut conn = db();
    assert_eq!(get_job(&conn, "nope").unwrap_err().kind(), "notFound");
    assert_eq!(set_job_status(&mut conn, "nope", JobStatus::Ready).unwrap_err().kind(), "notFound");
    assert_eq!(delete_job(&conn, "nope").unwrap_err().kind(), "notFound");
    let ghost = JobSnapshot {
        id: "nope".into(),
        name: "Ghost".into(),
        customer: None,
        notes: None,
        status: JobStatus::Draft,
        cabinets: vec![],
        rules: None,
        materials: None,
        saw_profile: None,
    };
    assert_eq!(save_job(&mut conn, &ghost).unwrap_err().kind(), "notFound");
    assert_eq!(write_pending_edit(&conn, &ghost, 0).unwrap_err().kind(), "notFound");
}

#[test]
fn deleting_a_job_cascades_to_its_cabinets_and_journal() {
    let mut conn = db();
    let job = new_job(&mut conn, "Doomed");
    let keep = new_job(&mut conn, "Kept");
    save_job(&mut conn, &snapshot(&job, vec![cabinet("a", "B1"), cabinet("b", "B2")])).unwrap();
    save_job(&mut conn, &snapshot(&keep, vec![cabinet("k", "B1")])).unwrap();
    write_pending_edit(&conn, &snapshot(&job, vec![cabinet("a", "B1")]), 1).unwrap();

    delete_job(&conn, &job.id).unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM cabinets"), 1);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM pending_edits"), 0);
    assert_eq!(get_job(&conn, &keep.id).unwrap().cabinets.len(), 1);
}

#[test]
fn duplicate_is_a_fully_independent_copy() {
    let mut conn = db();
    let source = create_job(
        &mut conn,
        &NewJob { name: "Kitchen".into(), customer: Some("Pat".into()), notes: Some("n".into()), construction: None, materials: None, saw_profile: None, cabinets: Vec::new() },
    )
    .unwrap();
    let mut snap = snapshot(&source, vec![cabinet("a", "B1"), cabinet("b", "W1")]);
    snap.status = JobStatus::Completed;
    save_job(&mut conn, &snap).unwrap();
    let source = get_job(&conn, &source.id).unwrap();

    let copy = duplicate_job(&mut conn, &source.id).unwrap();
    assert_ne!(copy.id, source.id);
    assert_eq!(copy.number, source.number + 1);
    assert_eq!(copy.name, "Kitchen (copy)");
    assert_eq!(copy.status, JobStatus::Draft);
    assert_eq!(copy.revision, 0);
    assert_eq!((copy.customer.as_deref(), copy.notes.as_deref()), (Some("Pat"), Some("n")));
    assert_eq!(copy.rules, source.rules);
    assert_eq!(copy.cabinets.len(), 2);
    for (a, b) in copy.cabinets.iter().zip(&source.cabinets) {
        assert_ne!(a.id, b.id);
        assert_eq!(Cabinet { id: b.id.clone(), ..a.clone() }, *b);
    }

    // Editing or deleting the copy leaves the source alone.
    let mut edit = snapshot(&copy, vec![Cabinet { width: 9, ..copy.cabinets[0].clone() }]);
    edit.name = "Changed".into();
    save_job(&mut conn, &edit).unwrap();
    assert_eq!(get_job(&conn, &source.id).unwrap(), source);
    delete_job(&conn, &copy.id).unwrap();
    assert_eq!(get_job(&conn, &source.id).unwrap(), source);

    assert_eq!(duplicate_job(&mut conn, "nope").unwrap_err().kind(), "notFound");
}

#[test]
fn rules_snapshot_is_not_affected_by_later_shop_setting_changes() {
    let mut conn = db();
    let before = new_job(&mut conn, "Before");
    let original_rules = before.rules.clone();

    let mut changed = original_rules.clone();
    changed["panelThickness"] = json!(46); // 23/32"
    set_shop_setting(&conn, RULES_SETTING, &changed).unwrap();
    assert_eq!(get_shop_settings(&conn).unwrap()[RULES_SETTING], changed);

    assert_eq!(get_job(&conn, &before.id).unwrap().rules, original_rules);
    let duplicate = duplicate_job(&mut conn, &before.id).unwrap();
    assert_eq!(duplicate.rules, original_rules, "a duplicate keeps its source's rules");
    let after = new_job(&mut conn, "After");
    assert_eq!(after.rules, changed);
}

#[test]
fn shop_settings_default_and_validate() {
    let conn = db();
    let settings = get_shop_settings(&conn).unwrap();
    assert_eq!(settings[RULES_SETTING], serde_json::from_str::<serde_json::Value>(DEFAULT_RULES_JSON).unwrap());
    set_shop_setting(&conn, "display", &json!({ "precision": 16 })).unwrap();
    assert_eq!(get_shop_settings(&conn).unwrap()["display"], json!({ "precision": 16 }));
    assert_eq!(set_shop_setting(&conn, "colour", &json!(1)).unwrap_err().kind(), "invalid");
    assert_eq!(set_shop_setting(&conn, RULES_SETTING, &json!(3)).unwrap_err().kind(), "invalid");
}

#[test]
fn lists_jobs_with_cabinet_outlines_newest_first() {
    let mut conn = db();
    let a = new_job(&mut conn, "A");
    let b = new_job(&mut conn, "B");
    save_job(&mut conn, &snapshot(&b, vec![cabinet("b1", "B1")])).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    save_job(
        &mut conn,
        &snapshot(&a, vec![Cabinet { cabinet_type: CabinetType::Wall, quantity: 2, ..cabinet("a1", "W1") }, cabinet("a2", "B1")]),
    )
    .unwrap();

    let jobs = list_jobs(&conn).unwrap();
    assert_eq!(jobs.iter().map(|j| j.name.as_str()).collect::<Vec<_>>(), ["A", "B"]);
    assert_eq!(jobs[0].cabinet_count, 2);
    assert_eq!(
        jobs[0].cabinets[0],
        CabinetOutline { label: "W1".into(), cabinet_type: CabinetType::Wall, width: 1920, height: 2208, depth: 1536, quantity: 2 }
    );
    assert_eq!(jobs[1].cabinet_count, 1);
}

// --- Crash recovery ------------------------------------------------------------

#[test]
fn a_successful_save_clears_the_journal() {
    let mut conn = db();
    let job = new_job(&mut conn, "Job");
    let snap = snapshot(&job, vec![cabinet("a", "B1")]);
    write_pending_edit(&conn, &snap, job.revision).unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM pending_edits"), 1);
    save_job(&mut conn, &snap).unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM pending_edits"), 0);
    assert!(recover_pending_edits(&mut conn).unwrap().is_empty());
}

#[test]
fn killing_the_process_mid_edit_loses_no_committed_change() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(DB_FILE_NAME);
    let backups = policy(dir.path());
    let job_id;
    {
        let (mut conn, _) = open(&path, Some(&backups)).unwrap();
        let job = new_job(&mut conn, "Kitchen remodel");
        job_id = job.id.clone();
        save_job(&mut conn, &snapshot(&job, vec![cabinet("a", "B1")])).unwrap();
        // The user commits two more edits. The client journals each one at once;
        // the debounced save never runs because the process dies.
        write_pending_edit(&conn, &snapshot(&job, vec![cabinet("a", "B1"), cabinet("b", "B2")]), 1).unwrap();
        let mut latest = snapshot(&job, vec![Cabinet { width: 2304, ..cabinet("a", "B1") }, cabinet("b", "B2")]);
        latest.notes = Some("typed just before the crash".into());
        write_pending_edit(&conn, &latest, 1).unwrap();
        // Simulate the kill: leak the connection so nothing is closed or checkpointed.
        std::mem::forget(conn);
    }

    let (mut conn, _) = open(&path, Some(&backups)).unwrap();
    let recovered = recover_pending_edits(&mut conn).unwrap();
    assert_eq!(recovered.len(), 1);
    assert_eq!(recovered[0].job_id, job_id);
    assert_eq!(recovered[0].job_name, "Kitchen remodel");
    assert_eq!(recovered[0].revision, 2);

    let job = get_job(&conn, &job_id).unwrap();
    assert_eq!(job.notes.as_deref(), Some("typed just before the crash"));
    assert_eq!(job.cabinets.iter().map(|c| c.width).collect::<Vec<_>>(), [2304, 1920]);

    // Applied exactly once.
    assert!(recover_pending_edits(&mut conn).unwrap().is_empty());
    assert_eq!(get_job(&conn, &job_id).unwrap().revision, 2);
}

#[test]
fn an_unreadable_journal_entry_is_kept_and_does_not_block_others() {
    let mut conn = db();
    let a = new_job(&mut conn, "A");
    let b = new_job(&mut conn, "B");
    conn.execute(
        "INSERT INTO pending_edits (job_id, payload_json, base_revision, written_at) VALUES (?1, 'not json', 0, 'x')",
        [&a.id],
    )
    .unwrap();
    write_pending_edit(&conn, &snapshot(&b, vec![cabinet("b1", "B1")]), 0).unwrap();
    let recovered = recover_pending_edits(&mut conn).unwrap();
    assert_eq!(recovered.iter().map(|r| r.job_name.as_str()).collect::<Vec<_>>(), ["B"]);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM pending_edits"), 1);
}

// --- Samples and errors ------------------------------------------------------------

#[test]
fn loads_the_sample_jobs() {
    let mut conn = db();
    let jobs = load_sample_jobs(&mut conn).unwrap();
    assert_eq!(jobs.iter().map(|j| j.number).collect::<Vec<_>>(), [14, 13, 12, 11, 9, 15, 16, 17, 18]);
    assert_eq!(jobs[0].name, "Kitchen remodel");
    assert_eq!(jobs[2].cabinets.len(), 8);
    assert_eq!(jobs[4].status, JobStatus::Archived);
    assert_eq!(jobs[6].cabinets.len(), 40);
    // One sample per construction to try: method B, and a ladder base under two runs.
    assert_eq!(jobs[7].rules["method"]["id"], json!("B"));
    assert_eq!(jobs[8].rules["method"]["baseType"], json!("ladder"));
    assert_eq!(jobs[8].cabinets[0].run.as_deref(), Some("Sink wall"));
    assert_eq!(jobs[0].rules, current_rules(&conn).unwrap());
    // Loading again doesn't collide on job numbers.
    let again = load_sample_jobs(&mut conn).unwrap();
    assert_eq!(again.iter().map(|j| j.number).collect::<Vec<_>>(), [19, 20, 21, 22, 23, 24, 25, 26, 27]);
}

#[test]
fn errors_serialize_as_kind_and_plain_message() {
    let value = serde_json::to_value(DbError::JobNotFound).unwrap();
    assert_eq!(value, json!({ "kind": "notFound", "message": "That job no longer exists. It may have been deleted." }));
    let value = serde_json::to_value(DbError::invalid("Cabinet B1 has a negative width.")).unwrap();
    assert_eq!(value["kind"], json!("invalid"));
}

// --- Import (.kerfjob) -------------------------------------------------------

fn exported(job: &Job) -> ImportJob {
    ImportJob {
        id: job.id.clone(),
        number: job.number,
        name: job.name.clone(),
        customer: job.customer.clone(),
        notes: job.notes.clone(),
        status: job.status,
        rules: job.rules.clone(),
        rules_version: job.rules_version,
        created_at: job.created_at.clone(),
        updated_at: job.updated_at.clone(),
        revision: job.revision,
        cabinets: job.cabinets.clone(),
        materials: job.materials.clone(),
        saw_profile: job.saw_profile.clone(),
        layouts: job.layouts.clone(),
    }
}

#[test]
fn a_job_from_another_pc_imports_exactly_as_exported() {
    let mut pc_a = db();
    let mut job = new_job(&mut pc_a, "Kitchen remodel");
    let mut snap = snapshot(&job, vec![cabinet("a", "B1"), Cabinet { width: 0, ..cabinet("b", "B2") }]);
    snap.customer = Some("Smith".into());
    snap.status = JobStatus::Ready;
    save_job(&mut pc_a, &snap).unwrap();
    set_shop_setting(&pc_a, RULES_SETTING, &json!({ "panelThickness": 46 })).unwrap();
    job = get_job(&pc_a, &job.id).unwrap();

    let mut pc_b = db();
    let imported = import_job(&mut pc_b, &exported(&job), ImportMode::New).unwrap();
    assert_eq!(imported, job, "every field, including the rules snapshot and cabinet ids");
    assert_eq!(imported.cabinets[1].width, 0, "an unfinished cabinet comes across as it was");
    assert_eq!(
        import_job(&mut pc_b, &exported(&job), ImportMode::New).unwrap_err().kind(),
        "invalid",
        "a second plain import has to choose copy or replace"
    );
}

#[test]
fn import_as_a_copy_is_a_separate_job() {
    let mut conn = db();
    let job = new_job(&mut conn, "Kitchen remodel");
    save_job(&mut conn, &snapshot(&job, vec![cabinet("a", "B1")])).unwrap();
    let job = get_job(&conn, &job.id).unwrap();

    let copy = import_job(&mut conn, &exported(&job), ImportMode::Copy).unwrap();
    assert_ne!(copy.id, job.id);
    assert_eq!(copy.number, 2);
    assert_eq!(copy.name, "Kitchen remodel (copy)");
    assert_eq!(copy.revision, 0);
    assert_ne!(copy.cabinets[0].id, "a");
    assert_eq!(copy.cabinets[0].label, "B1");
    assert_eq!(copy.rules, job.rules);
    assert_eq!(get_job(&conn, &job.id).unwrap(), job, "the original is untouched");
}

#[test]
fn import_replace_overwrites_the_job_with_the_same_id() {
    let mut conn = db();
    let job = new_job(&mut conn, "Kitchen remodel");
    save_job(&mut conn, &snapshot(&job, vec![cabinet("a", "B1"), cabinet("b", "B2")])).unwrap();
    write_pending_edit(&conn, &snapshot(&job, vec![]), 1).unwrap();
    let other = new_job(&mut conn, "Laundry room");

    let mut incoming = exported(&get_job(&conn, &job.id).unwrap());
    incoming.name = "Kitchen remodel, from the shop PC".into();
    incoming.cabinets = vec![Cabinet { width: 2304, ..cabinet("a", "B1") }];
    incoming.number = other.number; // the other PC numbered it differently

    let replaced = import_job(&mut conn, &incoming, ImportMode::Replace).unwrap();
    assert_eq!(replaced.id, job.id);
    assert_eq!(replaced.name, "Kitchen remodel, from the shop PC");
    assert_eq!(replaced.number, job.number, "keeps its own number when the file's is taken here");
    assert_eq!(replaced.cabinets.len(), 1);
    assert_eq!(replaced.cabinets[0].width, 2304);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM pending_edits"), 0, "stale unsaved edits go with it");
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM jobs"), 2);

    let missing = ImportJob { id: "nope".into(), ..incoming };
    assert_eq!(import_job(&mut conn, &missing, ImportMode::Replace).unwrap_err().kind(), "notFound");
}

#[test]
fn import_avoids_numbers_and_cabinet_ids_already_used_here() {
    let mut conn = db();
    let here = new_job(&mut conn, "Here");
    save_job(&mut conn, &snapshot(&here, vec![cabinet("shared", "B1")])).unwrap();

    let mut pc_b = db();
    let there = new_job(&mut pc_b, "There"); // also J-0001, and reuses a cabinet id
    save_job(&mut pc_b, &snapshot(&there, vec![cabinet("shared", "B1")])).unwrap();
    let imported = import_job(&mut conn, &exported(&get_job(&pc_b, &there.id).unwrap()), ImportMode::New).unwrap();
    assert_eq!(imported.id, there.id);
    assert_eq!(imported.number, 2);
    assert_ne!(imported.cabinets[0].id, "shared");
    assert_eq!(get_job(&conn, &here.id).unwrap().cabinets[0].id, "shared");
}

#[test]
fn import_refuses_data_the_database_must_never_hold() {
    let mut conn = db();
    let job = new_job(&mut conn, "Kitchen remodel");
    let good = exported(&job);
    let cases = [
        ImportJob { cabinets: vec![Cabinet { width: -1, ..cabinet("a", "B1") }], ..good.clone() },
        ImportJob { cabinets: vec![cabinet("a", "B1"), cabinet("a", "B2")], ..good.clone() },
        ImportJob { rules_version: RULES_VERSION + 1, ..good.clone() },
        ImportJob { rules: json!(null), ..good.clone() },
        ImportJob { name: " ".into(), ..good.clone() },
        ImportJob { number: 0, ..good.clone() },
    ];
    for bad in cases {
        assert_eq!(import_job(&mut conn, &bad, ImportMode::Copy).unwrap_err().kind(), "invalid");
    }
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM jobs"), 1);
}

#[test]
fn a_new_job_takes_the_chosen_construction_and_the_shop_settings() {
    let mut conn = db();
    let mut shop: serde_json::Value = serde_json::from_str(DEFAULT_RULES_JSON).unwrap();
    shop["method"]["kickDepth"] = json!(128);
    set_shop_setting(&conn, RULES_SETTING, &shop).unwrap();

    shop["method"]["baseType"] = json!("legs");
    set_shop_setting(&conn, RULES_SETTING, &shop).unwrap();
    let choice = ConstructionChoice { id: MethodId::B, base_type: BaseType::Ladder };
    let job = create_job(&mut conn, &NewJob { name: "Integral".into(), construction: Some(choice), ..Default::default() }).unwrap();
    assert_eq!(job.rules["method"]["id"], json!("B"));
    assert_eq!(job.rules["method"]["baseType"], json!("legs"), "method B keeps the shop base type, unused");
    assert_eq!(job.rules["method"]["kickDepth"], json!(128), "the shop's other settings are kept");

    let ladder = ConstructionChoice { id: MethodId::A, base_type: BaseType::Ladder };
    let job = create_job(&mut conn, &NewJob { name: "Ladder".into(), construction: Some(ladder), ..Default::default() }).unwrap();
    assert_eq!((job.rules["method"]["id"].clone(), job.rules["method"]["baseType"].clone()), (json!("A"), json!("ladder")));

    // No choice: the shop default, here A2.
    let default = new_job(&mut conn, "Default");
    assert_eq!(default.rules["method"]["id"], json!("A"));
    assert_eq!(default.rules["method"]["baseType"], json!("legs"));
}

#[test]
fn construction_changes_save_only_while_the_job_is_a_draft() {
    let mut conn = db();
    let job = new_job(&mut conn, "Kitchen");
    let mut rules = job.rules.clone();
    rules["method"]["id"] = json!("B");

    let mut snap = snapshot(&job, vec![cabinet("a", "B1")]);
    snap.rules = Some(rules.clone());
    save_job(&mut conn, &snap).unwrap();
    let saved = get_job(&conn, &job.id).unwrap();
    assert_eq!(saved.rules["method"]["id"], json!("B"));
    assert_eq!(saved.rules_version, RULES_VERSION);

    // Changing the method and marking it ready in one save is still a draft change.
    snap.rules = Some(job.rules.clone());
    snap.status = JobStatus::Ready;
    save_job(&mut conn, &snap).unwrap();
    assert_eq!(get_job(&conn, &job.id).unwrap().rules["method"]["id"], json!("A"));

    // Ready to cut: locked, and nothing in the snapshot is written.
    snap.rules = Some(rules.clone());
    snap.name = "Renamed".into();
    let error = save_job(&mut conn, &snap).unwrap_err();
    assert_eq!(error.kind(), "invalid");
    let after = get_job(&conn, &job.id).unwrap();
    assert_eq!((after.name.as_str(), after.rules["method"]["id"].clone()), ("Kitchen", json!("A")));

    // An undo back to draft may restore it.
    snap.status = JobStatus::Draft;
    save_job(&mut conn, &snap).unwrap();
    assert_eq!(get_job(&conn, &job.id).unwrap().rules["method"]["id"], json!("B"));

    // Without rules, a ready job saves as before.
    snap.status = JobStatus::Ready;
    snap.rules = None;
    save_job(&mut conn, &snap).unwrap();
}

#[test]
fn a_version_1_job_becomes_version_2_when_its_construction_changes() {
    let mut conn = db();
    let job = new_job(&mut conn, "Old");
    let mut v1 = job.rules.clone();
    v1.as_object_mut().unwrap().remove("method");
    conn.execute("UPDATE jobs SET rules_json = ?2, rules_version = 1 WHERE id = ?1", rusqlite::params![job.id, v1.to_string()])
        .unwrap();

    // A save without rules leaves the version 1 snapshot alone.
    save_job(&mut conn, &snapshot(&job, vec![])).unwrap();
    assert_eq!(get_job(&conn, &job.id).unwrap().rules_version, 1);

    let mut snap = snapshot(&job, vec![]);
    snap.rules = Some(job.rules.clone());
    save_job(&mut conn, &snap).unwrap();
    let saved = get_job(&conn, &job.id).unwrap();
    assert_eq!(saved.rules_version, RULES_VERSION);
    assert!(saved.rules["method"].is_object());
}

#[test]
fn journaled_construction_changes_are_recovered() {
    let mut conn = db();
    let job = new_job(&mut conn, "Kitchen");
    let mut snap = snapshot(&job, vec![cabinet("a", "B1")]);
    let mut rules = job.rules.clone();
    rules["method"]["baseType"] = json!("legs");
    snap.rules = Some(rules);
    write_pending_edit(&conn, &snap, job.revision).unwrap();
    recover_pending_edits(&mut conn).unwrap();
    assert_eq!(get_job(&conn, &job.id).unwrap().rules["method"]["baseType"], json!("legs"));

    let mut bad = snap.clone();
    bad.rules = Some(json!({ "panelThickness": 48 }));
    assert_eq!(save_job(&mut conn, &bad).unwrap_err().kind(), "invalid");
}

// ---------------------------------------------------------------------------
// Materials (schema version 3)
// ---------------------------------------------------------------------------

fn material(id: &str, kind: MaterialKind, name: &str) -> Material {
    Material {
        id: id.into(),
        kind,
        name: name.into(),
        thickness: None,
        length: None,
        width: None,
        grain: MaterialGrain::None,
        banding_width: None,
        roll_feet: None,
        unit: None,
        price: None,
        supplier: None,
        sku: None,
        notes: None,
        on_hand: None,
        archived: false,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn job_materials(id: &str) -> serde_json::Value {
    json!({ "slots": { "box": { "id": id, "kind": "sheet", "name": "Birch", "price": 6800, "pricedAt": "2026-11-02" } } })
}

#[test]
fn a_new_database_has_the_standard_materials_without_prices() {
    let conn = db();
    let all = list_materials(&conn).unwrap();
    assert_eq!(all.len(), 12);
    assert!(all.iter().all(|m| m.price.is_none() && !m.archived));
    let birch = &all[0];
    assert_eq!((birch.id.as_str(), birch.name.as_str()), ("std-birch-3-4", "Birch plywood 3/4″"));
    assert_eq!((birch.thickness, birch.length, birch.width, birch.grain), (Some(48), Some(6144), Some(3072), MaterialGrain::Length));
    let melamine = all.iter().find(|m| m.id == "std-melamine-white-3-4").unwrap();
    assert_eq!((melamine.length, melamine.width, melamine.grain), (Some(97 * 64), Some(49 * 64), MaterialGrain::None));
    let kinds: Vec<_> = all.iter().map(|m| m.kind.as_str()).collect();
    assert_eq!(kinds.iter().filter(|k| **k == "laminate").count(), 2);
    assert_eq!(kinds.iter().filter(|k| **k == "hardware").count(), 2);
}

#[test]
fn migration_3_adds_materials_to_a_version_2_database_with_jobs_in_it() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    conn.execute_batch(include_str!("fixtures/schema_v1.sql")).unwrap();
    conn.execute_batch(include_str!("migrations/0002_cabinet_runs.sql")).unwrap();
    conn.execute("UPDATE meta SET value = '2' WHERE key = 'schema_version'", []).unwrap();
    assert_eq!(schema_version(&conn).unwrap(), 2);

    let report = migrate(&mut conn, None).unwrap();
    assert_eq!((report.from_version, report.to_version), (2, LATEST_VERSION));
    assert_eq!(schema(&conn), schema(&db()), "a migrated database must equal a fresh one");
    assert_eq!(list_materials(&conn).unwrap().len(), 12);
    // Existing jobs have no materials: the app gives them the shop defaults when they open.
    assert_eq!(get_job(&conn, "fixture-job-1").unwrap().materials, None);
}

#[test]
fn materials_are_added_edited_normalized_and_archived() {
    let mut conn = db();
    let mut ply = material("m1", MaterialKind::Sheet, "  Baltic birch 18mm ");
    ply.thickness = Some(45);
    ply.length = Some(60 * 64);
    ply.width = Some(60 * 64);
    ply.grain = MaterialGrain::Length;
    ply.unit = Some("each".into()); // not a hardware field: dropped
    ply.supplier = Some("  ".into());
    ply.price = Some(8999);
    let saved = save_material(&mut conn, &ply).unwrap();
    assert_eq!(saved.name, "Baltic birch 18mm");
    assert_eq!((&saved.unit, &saved.supplier), (&None, &None));
    assert!(!saved.created_at.is_empty());
    assert_eq!(list_materials(&conn).unwrap().last().unwrap().id, "m1");

    let archived = save_material(&mut conn, &Material { archived: true, on_hand: Some(3), ..saved.clone() }).unwrap();
    assert!(archived.archived);
    assert_eq!(archived.on_hand, Some(3));
    assert_eq!(list_materials(&conn).unwrap().len(), 13, "archived materials are still listed");
    assert_eq!(list_materials(&conn).unwrap().last().unwrap().id, "m1", "an edit keeps its place");

    for bad in [
        Material { name: " ".into(), ..ply.clone() },
        Material { thickness: None, ..ply.clone() },
        Material { length: Some(0), ..ply.clone() },
        Material { price: Some(-1), ..ply.clone() },
        Material { on_hand: Some(-2), ..ply.clone() },
        material("m2", MaterialKind::Laminate, "HPL"),
    ] {
        assert!(matches!(save_material(&mut conn, &bad), Err(DbError::Invalid(_))), "{bad:?}");
    }
    let mut leg = material("m3", MaterialKind::Hardware, "Leg");
    leg.thickness = Some(48);
    leg.unit = Some("each".into());
    let leg = save_material(&mut conn, &leg).unwrap();
    assert_eq!((leg.thickness, leg.unit.as_deref()), (None, Some("each")));
}

#[test]
fn a_material_a_job_uses_cant_be_deleted() {
    let mut conn = db();
    let job = create_job(
        &mut conn,
        &NewJob { name: "Kitchen".into(), customer: None, notes: None, construction: None, materials: Some(job_materials("std-birch-3-4")), saw_profile: None, cabinets: Vec::new() },
    )
    .unwrap();
    assert_eq!(job.materials, Some(job_materials("std-birch-3-4")));
    let error = delete_material(&conn, "std-birch-3-4").unwrap_err();
    assert_eq!(error.to_string(), "This material is used by Kitchen, so it can't be deleted. Archive it instead.");

    set_shop_setting(&conn, "estimate", &json!({ "wastePercent": 15, "defaults": { "laminate": "std-hpl-48x96" } })).unwrap();
    assert!(delete_material(&conn, "std-hpl-48x96").unwrap_err().to_string().contains("default for new jobs"));

    delete_material(&conn, "std-mdf-3-4").unwrap();
    assert!(list_materials(&conn).unwrap().iter().all(|m| m.id != "std-mdf-3-4"));

    // Once the job chooses another material, the first can go.
    let mut snap = snapshot(&job, vec![]);
    snap.materials = Some(job_materials("std-maple-prefinished-3-4"));
    save_job(&mut conn, &snap).unwrap();
    delete_material(&conn, "std-birch-3-4").unwrap();
}

#[test]
fn job_materials_save_duplicate_and_import_with_the_job() {
    let mut conn = db();
    let job = new_job(&mut conn, "Kitchen");
    assert_eq!(job.materials, None);

    // A snapshot without materials leaves them as they are.
    save_job(&mut conn, &snapshot(&job, vec![])).unwrap();
    assert_eq!(get_job(&conn, &job.id).unwrap().materials, None);

    let mut snap = snapshot(&job, vec![]);
    snap.materials = Some(job_materials("std-birch-3-4"));
    save_job(&mut conn, &snap).unwrap();
    let saved = get_job(&conn, &job.id).unwrap();
    assert_eq!(saved.materials, Some(job_materials("std-birch-3-4")));
    save_job(&mut conn, &snapshot(&saved, vec![])).unwrap();
    assert_eq!(get_job(&conn, &job.id).unwrap().materials, Some(job_materials("std-birch-3-4")));

    let copy = duplicate_job(&mut conn, &job.id).unwrap();
    assert_eq!(copy.materials, saved.materials);

    let mut bad = snapshot(&saved, vec![]);
    bad.materials = Some(json!({ "slots": { "box": { "name": "no id" } } }));
    assert!(matches!(save_job(&mut conn, &bad), Err(DbError::Invalid(_))));

    // A crash-recovery journal carries them too.
    write_pending_edit(&conn, &snap, saved.revision).unwrap();
    assert_eq!(recover_pending_edits(&mut conn).unwrap().len(), 1);

    // An exported job brings its materials; a file from before materials has none.
    let saved = get_job(&conn, &job.id).unwrap();
    let imported = import_job(&mut conn, &exported(&saved), ImportMode::Copy).unwrap();
    assert_eq!(imported.materials, saved.materials);
    let older = ImportJob { materials: None, ..exported(&saved) };
    assert_eq!(import_job(&mut conn, &older, ImportMode::Copy).unwrap().materials, None);
}

fn saw_profile(kerf: i64) -> serde_json::Value {
    json!({
        "id": "table-saw", "name": "Table saw", "kerf": kerf, "edgeTrim": 16, "minPiece": 128,
        "keepLength": 768, "keepWidth": 768, "firstCut": "length", "extraSheets": 1
    })
}

#[test]
fn migration_4_adds_saw_profiles_to_a_version_3_database_with_jobs_in_it() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    conn.execute_batch(include_str!("fixtures/schema_v1.sql")).unwrap();
    conn.execute_batch(include_str!("migrations/0002_cabinet_runs.sql")).unwrap();
    conn.execute_batch(include_str!("migrations/0003_materials.sql")).unwrap();
    conn.execute("UPDATE meta SET value = '3' WHERE key = 'schema_version'", []).unwrap();

    let report = migrate(&mut conn, None).unwrap();
    assert_eq!((report.from_version, report.to_version), (3, LATEST_VERSION));
    assert_eq!(schema(&conn), schema(&db()), "a migrated database must equal a fresh one");
    // Existing jobs have no saw profile: the app uses the shop's default.
    assert_eq!(get_job(&conn, "fixture-job-1").unwrap().saw_profile, None);
}

#[test]
fn a_jobs_saw_profile_saves_duplicates_and_imports_with_the_job() {
    let mut conn = db();
    let job = create_job(&mut conn, &NewJob { name: "Kitchen".into(), saw_profile: Some(saw_profile(8)), ..Default::default() }).unwrap();
    assert_eq!(job.saw_profile, Some(saw_profile(8)));

    // A snapshot without one leaves it as it is.
    save_job(&mut conn, &snapshot(&job, vec![])).unwrap();
    assert_eq!(get_job(&conn, &job.id).unwrap().saw_profile, Some(saw_profile(8)));
    let mut snap = snapshot(&job, vec![]);
    snap.saw_profile = Some(saw_profile(6));
    save_job(&mut conn, &snap).unwrap();
    let saved = get_job(&conn, &job.id).unwrap();
    assert_eq!(saved.saw_profile, Some(saw_profile(6)));
    assert_eq!(duplicate_job(&mut conn, &job.id).unwrap().saw_profile, Some(saw_profile(6)));

    for bad in [json!({ "id": "x", "name": "No kerf" }), json!({ "kerf": 8 }), {
        let mut p = saw_profile(8);
        p["firstCut"] = json!("sideways");
        p
    }] {
        let mut snap = snapshot(&saved, vec![]);
        snap.saw_profile = Some(bad.clone());
        assert!(matches!(save_job(&mut conn, &snap), Err(DbError::Invalid(_))), "{bad}");
        let new = NewJob { name: "Bad".into(), saw_profile: Some(bad), ..Default::default() };
        assert!(matches!(create_job(&mut conn, &new), Err(DbError::Invalid(_))));
    }

    let imported = import_job(&mut conn, &exported(&saved), ImportMode::Copy).unwrap();
    assert_eq!(imported.saw_profile, saved.saw_profile);
    let older = ImportJob { saw_profile: None, ..exported(&saved) };
    assert_eq!(import_job(&mut conn, &older, ImportMode::Copy).unwrap().saw_profile, None);

    // The shop's profiles are a shop setting.
    set_shop_setting(&conn, "saw_profiles", &json!({ "profiles": [saw_profile(8)], "defaultId": "table-saw" })).unwrap();
    assert_eq!(get_shop_settings(&conn).unwrap()["saw_profiles"]["defaultId"], json!("table-saw"));
}

// --- Saved layouts (schema version 5) ----------------------------------------

fn saved_layout(material: &str, hash: &str, version: i64) -> SavedLayout {
    SavedLayout {
        material_id: material.into(),
        input_hash: hash.into(),
        algorithm_version: version,
        mode: "cost".into(),
        profile: saw_profile(8),
        layout: json!({ "material": { "id": material }, "patterns": [{ "id": 1, "count": 2 }], "stats": { "sheets": 2 } }),
        created_at: "2026-11-02T10:00:00.000Z".into(),
    }
}

#[test]
fn migration_5_adds_saved_layouts_to_a_version_4_database_with_jobs_in_it() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    conn.execute_batch(include_str!("fixtures/schema_v1.sql")).unwrap();
    conn.execute_batch(include_str!("migrations/0002_cabinet_runs.sql")).unwrap();
    conn.execute_batch(include_str!("migrations/0003_materials.sql")).unwrap();
    conn.execute_batch(include_str!("migrations/0004_saw_profiles.sql")).unwrap();
    conn.execute("UPDATE meta SET value = '4' WHERE key = 'schema_version'", []).unwrap();

    let report = migrate(&mut conn, None).unwrap();
    assert_eq!((report.from_version, report.to_version), (4, LATEST_VERSION));
    assert_eq!(schema(&conn), schema(&db()), "a migrated database must equal a fresh one");
    // Existing jobs have no saved layouts: they're laid out as needed.
    assert_eq!(get_job(&conn, "fixture-job-1").unwrap().layouts, vec![]);
}

#[test]
fn saved_layouts_are_kept_with_the_job_without_a_new_revision() {
    let mut conn = db();
    let job = new_job(&mut conn, "Kitchen");
    let layouts = vec![saved_layout("birch-ply-34", "abc", 1), saved_layout("melamine-34", "def", 1)];
    save_job_layouts(&mut conn, &job.id, &layouts).unwrap();
    let saved = get_job(&conn, &job.id).unwrap();
    assert_eq!(saved.layouts, layouts);
    assert_eq!((saved.revision, saved.updated_at.clone()), (job.revision, job.updated_at.clone()), "saving a layout isn't an edit");

    // Saving again replaces them all; a save of the job leaves them alone.
    save_job_layouts(&mut conn, &job.id, &layouts[..1]).unwrap();
    save_job(&mut conn, &snapshot(&saved, vec![cabinet("a", "B1")])).unwrap();
    assert_eq!(get_job(&conn, &job.id).unwrap().layouts, layouts[..1].to_vec());

    // A duplicate is a draft: it lays itself out again.
    assert_eq!(duplicate_job(&mut conn, &job.id).unwrap().layouts, vec![]);

    let bad = [
        vec![SavedLayout { mode: "fastest".into(), ..saved_layout("m", "h", 1) }],
        vec![SavedLayout { material_id: " ".into(), ..saved_layout("m", "h", 1) }],
        vec![SavedLayout { algorithm_version: -1, ..saved_layout("m", "h", 1) }],
        vec![SavedLayout { profile: json!({ "kerf": 8 }), ..saved_layout("m", "h", 1) }],
        vec![SavedLayout { layout: json!({ "material": { "id": "other" }, "patterns": [] }), ..saved_layout("m", "h", 1) }],
        vec![SavedLayout { layout: json!({ "material": { "id": "m" } }), ..saved_layout("m", "h", 1) }],
        vec![saved_layout("m", "h", 1), saved_layout("m", "i", 1)],
    ];
    for layouts in bad {
        assert!(matches!(save_job_layouts(&mut conn, &job.id, &layouts), Err(DbError::Invalid(_))), "{layouts:?}");
    }
    assert_eq!(get_job(&conn, &job.id).unwrap().layouts, vec![saved_layout("birch-ply-34", "abc", 1)], "a refused save changes nothing");
    assert!(matches!(save_job_layouts(&mut conn, "nope", &[]), Err(DbError::JobNotFound)));

    // They go with the job.
    delete_job(&conn, &job.id).unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM layouts"), 0);
}

#[test]
fn a_ready_jobs_layout_is_still_there_after_a_restart() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(DB_FILE_NAME);
    let (mut conn, _) = open(&path, None).unwrap();
    let job = new_job(&mut conn, "Kitchen");
    let mut snap = snapshot(&job, vec![cabinet("a", "B1")]);
    snap.status = JobStatus::Ready;
    save_job(&mut conn, &snap).unwrap();
    // Made by an older optimizer: kept as it was, never worked out again here.
    save_job_layouts(&mut conn, &job.id, &[saved_layout("birch-ply-34", "abc", 0)]).unwrap();
    drop(conn);

    let (conn, _) = open(&path, None).unwrap();
    let reopened = get_job(&conn, &job.id).unwrap();
    assert_eq!(reopened.status, JobStatus::Ready);
    assert_eq!(reopened.layouts, vec![saved_layout("birch-ply-34", "abc", 0)]);
}

#[test]
fn saved_layouts_import_with_the_job() {
    let mut conn = db();
    let job = new_job(&mut conn, "Kitchen");
    save_job_layouts(&mut conn, &job.id, &[saved_layout("birch-ply-34", "abc", 1)]).unwrap();
    let saved = get_job(&conn, &job.id).unwrap();

    let copy = import_job(&mut conn, &exported(&saved), ImportMode::Copy).unwrap();
    assert_eq!(copy.layouts, saved.layouts);
    let replaced = import_job(&mut conn, &ImportJob { layouts: vec![], ..exported(&saved) }, ImportMode::Replace).unwrap();
    assert_eq!(replaced.layouts, vec![], "a replaced job takes the file's layouts, none here");

    let bad = ImportJob { layouts: vec![SavedLayout { mode: "fastest".into(), ..saved_layout("m", "h", 1) }], ..exported(&saved) };
    assert_eq!(import_job(&mut conn, &bad, ImportMode::Copy).unwrap_err().kind(), "invalid");
}

// --- First run (prompt 14) ---------------------------------------------------

/// A version 5 database made from the v1 fixture (two jobs, saved construction rules).
fn version_5_database(conn: &Connection) {
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    conn.execute_batch(include_str!("fixtures/schema_v1.sql")).unwrap();
    conn.execute_batch(include_str!("migrations/0002_cabinet_runs.sql")).unwrap();
    conn.execute_batch(include_str!("migrations/0003_materials.sql")).unwrap();
    conn.execute_batch(include_str!("migrations/0004_saw_profiles.sql")).unwrap();
    conn.execute_batch(include_str!("migrations/0005_layouts.sql")).unwrap();
    conn.execute("UPDATE meta SET value = '5' WHERE key = 'schema_version'", []).unwrap();
}

fn defaults_checked(conn: &Connection) -> Option<serde_json::Value> {
    get_shop_settings(conn).unwrap().get(DEFAULTS_CHECKED_SETTING).cloned()
}

#[test]
fn a_new_database_has_not_checked_its_defaults() {
    let conn = db();
    assert_eq!(defaults_checked(&conn), None);
    set_shop_setting(&conn, DEFAULTS_CHECKED_SETTING, &json!(true)).unwrap();
    assert_eq!(defaults_checked(&conn), Some(json!(true)));
    assert_eq!(set_shop_setting(&conn, DEFAULTS_CHECKED_SETTING, &json!("yes")).unwrap_err().kind(), "invalid");
}

#[test]
fn migration_6_marks_defaults_checked_only_where_the_shop_is_already_in_use() {
    // Jobs in it: checked.
    let mut with_jobs = Connection::open_in_memory().unwrap();
    version_5_database(&with_jobs);
    let report = migrate(&mut with_jobs, None).unwrap();
    assert_eq!((report.from_version, report.to_version), (5, LATEST_VERSION));
    assert_eq!(schema(&with_jobs), schema(&db()), "a migrated database must equal a fresh one");
    assert_eq!(defaults_checked(&with_jobs), Some(json!(true)));

    // No jobs, but its own construction defaults saved: checked.
    let mut saved_rules = Connection::open_in_memory().unwrap();
    version_5_database(&saved_rules);
    saved_rules.execute_batch("DELETE FROM jobs;").unwrap();
    migrate(&mut saved_rules, None).unwrap();
    assert_eq!(defaults_checked(&saved_rules), Some(json!(true)));

    // Neither: not checked.
    let mut unused = Connection::open_in_memory().unwrap();
    version_5_database(&unused);
    unused.execute_batch("DELETE FROM jobs; DELETE FROM shop_settings;").unwrap();
    migrate(&mut unused, None).unwrap();
    assert_eq!(defaults_checked(&unused), None);
}

#[test]
fn migration_6_backs_up_the_version_5_database_first() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(DB_FILE_NAME);
    version_5_database(&Connection::open(&path).unwrap());
    let backups = policy(dir.path());
    let (conn, report) = open(&path, Some(&backups)).unwrap();
    assert_eq!(defaults_checked(&conn), Some(json!(true)));
    let copy = Connection::open(report.backup.expect("a pre-upgrade backup")).unwrap();
    assert_eq!(schema_version(&copy).unwrap(), 5, "the copy is from before the upgrade");
    assert_eq!(count(&copy, "SELECT COUNT(*) FROM jobs"), 2);
}

#[test]
fn the_example_job_is_an_ordinary_draft_with_the_shop_defaults() {
    let mut conn = db();
    new_job(&mut conn, "Real work");
    let example = add_example_job(&mut conn).unwrap();
    assert_eq!(example.name, "Example – Small kitchen");
    assert_eq!(example.customer.as_deref(), Some("Example"));
    assert_eq!(example.number, 2, "the next job number");
    assert_eq!(example.status, JobStatus::Draft);
    assert_eq!(example.rules, current_rules(&conn).unwrap());
    let cabinets = &example.cabinets;
    assert!(cabinets.iter().any(|c| c.cabinet_type == CabinetType::Base));
    assert!(cabinets.iter().any(|c| c.cabinet_type == CabinetType::Wall));
    assert!(cabinets.iter().any(|c| c.finished_ends != FinishedEnds::None));
    assert!(cabinets.iter().any(|c| c.quantity > 1));
    // The built-in method (A1) puts bases on runs.
    assert!(cabinets.iter().filter(|c| c.cabinet_type == CabinetType::Base).all(|c| c.run.as_deref() == Some("Sink wall")));
    assert!(cabinets.iter().filter(|c| c.cabinet_type == CabinetType::Wall).all(|c| c.run.is_none()));

    // Adding it again gives another job, so it can come back after archiving.
    set_job_status(&mut conn, &example.id, JobStatus::Archived).unwrap();
    let again = add_example_job(&mut conn).unwrap();
    assert_ne!(again.id, example.id);
    assert_eq!(again.number, 3);

    // A shop whose default method has no runs gets the example without them.
    let mut rules = current_rules(&conn).unwrap();
    rules["method"]["id"] = json!("B");
    set_shop_setting(&conn, RULES_SETTING, &rules).unwrap();
    let no_runs = add_example_job(&mut conn).unwrap();
    assert_eq!(no_runs.rules["method"]["id"], json!("B"));
    assert!(no_runs.cabinets.iter().all(|c| c.run.is_none()));
}
