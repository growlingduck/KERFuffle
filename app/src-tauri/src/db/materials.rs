//! The shop's materials catalog (plan §3.1). Jobs keep their own copy of each
//! material they use (`materials_json` on the job), so editing or archiving a
//! material never changes a job; deleting one a job uses is refused.

use rusqlite::{params, Connection, OptionalExtension, Row};

use super::error::{DbError, DbResult};
use super::models::{Material, MaterialGrain, MaterialKind};
use super::repo::now;

/// The materials a new database starts with, without prices. The app's
/// in-memory store reads the same file.
pub const STANDARD_MATERIALS_JSON: &str = include_str!("standard_materials.json");

/// The shop setting that holds the estimate defaults, including the default
/// material per slot for new jobs.
pub const ESTIMATE_SETTING: &str = "estimate";

const COLUMNS: &str = "id, kind, name, thickness, length, width, grain, banding_width, roll_feet, unit, \
                       price_cents, supplier, sku, notes, on_hand, archived, created_at, updated_at";

fn read_row(row: &Row<'_>) -> rusqlite::Result<(Material, String, String)> {
    Ok((
        Material {
            id: row.get(0)?,
            // Placeholder; the text is parsed below so a bad value is reported as corrupt.
            kind: MaterialKind::Sheet,
            name: row.get(2)?,
            thickness: row.get(3)?,
            length: row.get(4)?,
            width: row.get(5)?,
            grain: MaterialGrain::None,
            banding_width: row.get(7)?,
            roll_feet: row.get(8)?,
            unit: row.get(9)?,
            price: row.get(10)?,
            supplier: row.get(11)?,
            sku: row.get(12)?,
            notes: row.get(13)?,
            on_hand: row.get(14)?,
            archived: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
        },
        row.get(1)?,
        row.get(6)?,
    ))
}

/// Every material, archived ones too, in catalog order.
pub fn list_materials(conn: &Connection) -> DbResult<Vec<Material>> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM materials ORDER BY position, rowid"))?;
    let rows = stmt.query_map([], read_row)?;
    let mut materials = Vec::new();
    for row in rows {
        let (mut material, kind, grain) = row?;
        material.kind = MaterialKind::parse(&kind)?;
        material.grain = MaterialGrain::parse(&grain)?;
        materials.push(material);
    }
    Ok(materials)
}

pub fn get_material(conn: &Connection, id: &str) -> DbResult<Option<Material>> {
    Ok(list_materials(conn)?.into_iter().find(|m| m.id == id))
}

/// Add a material at `position`, stamped now. Used by the seed and by `save_material`.
pub(crate) fn insert_material(conn: &Connection, material: &Material, position: i64) -> DbResult<()> {
    let m = material.normalized();
    m.check()?;
    let stamp = now(conn)?;
    conn.execute(
        &format!(
            "INSERT INTO materials (position, {COLUMNS})
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18)"
        ),
        params![
            position,
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
            m.price,
            m.supplier,
            m.sku,
            m.notes,
            m.on_hand,
            m.archived,
            stamp,
        ],
    )?;
    Ok(())
}

/// Add a material (last in the list) or replace one, keeping its place.
/// Returns it as stored.
pub fn save_material(conn: &mut Connection, material: &Material) -> DbResult<Material> {
    let m = material.normalized();
    m.check()?;
    let tx = conn.transaction()?;
    let exists: bool = tx.query_row("SELECT EXISTS (SELECT 1 FROM materials WHERE id = ?1)", [&m.id], |row| row.get(0))?;
    if exists {
        let stamp = now(&tx)?;
        tx.execute(
            "UPDATE materials SET kind = ?2, name = ?3, thickness = ?4, length = ?5, width = ?6, grain = ?7,
               banding_width = ?8, roll_feet = ?9, unit = ?10, price_cents = ?11, supplier = ?12, sku = ?13,
               notes = ?14, on_hand = ?15, archived = ?16, updated_at = ?17
             WHERE id = ?1",
            params![
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
                m.price,
                m.supplier,
                m.sku,
                m.notes,
                m.on_hand,
                m.archived,
                stamp,
            ],
        )?;
    } else {
        let position: i64 = tx.query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM materials", [], |row| row.get(0))?;
        insert_material(&tx, &m, position)?;
    }
    let saved = get_material(&tx, &m.id)?.ok_or_else(|| DbError::Storage("the material wasn't saved".into()))?;
    tx.commit()?;
    Ok(saved)
}

/// The jobs (by name) whose materials include this one.
fn jobs_using(conn: &Connection, id: &str) -> DbResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT name, materials_json FROM jobs WHERE materials_json IS NOT NULL ORDER BY number")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    let mut names = Vec::new();
    for row in rows {
        let (name, json) = row?;
        let value: serde_json::Value = serde_json::from_str(&json)?;
        let uses = value
            .get("slots")
            .and_then(serde_json::Value::as_object)
            .is_some_and(|slots| slots.values().any(|m| m.get("id").and_then(serde_json::Value::as_str) == Some(id)));
        if uses {
            names.push(name);
        }
    }
    Ok(names)
}

/// Whether the shop's defaults for new jobs name this material.
fn is_default(conn: &Connection, id: &str) -> DbResult<bool> {
    let stored: Option<String> = conn
        .query_row("SELECT value_json FROM shop_settings WHERE key = ?1", [ESTIMATE_SETTING], |row| row.get(0))
        .optional()?;
    let Some(json) = stored else { return Ok(false) };
    let value: serde_json::Value = serde_json::from_str(&json)?;
    Ok(value
        .get("defaults")
        .and_then(serde_json::Value::as_object)
        .is_some_and(|defaults| defaults.values().any(|v| v.as_str() == Some(id))))
}

/// Delete a material no job uses. A used one can be archived instead.
pub fn delete_material(conn: &Connection, id: &str) -> DbResult<()> {
    let users = jobs_using(conn, id)?;
    if let Some(first) = users.first() {
        let others = match users.len() {
            1 => String::new(),
            2 => " and 1 other job".to_string(),
            n => format!(" and {} other jobs", n - 1),
        };
        return Err(DbError::invalid(format!(
            "This material is used by {first}{others}, so it can't be deleted. Archive it instead."
        )));
    }
    if is_default(conn, id)? {
        return Err(DbError::invalid(
            "This material is a default for new jobs. Choose another default in Settings first, or archive it.",
        ));
    }
    if conn.execute("DELETE FROM materials WHERE id = ?1", [id])? == 0 {
        return Err(DbError::invalid("That material no longer exists."));
    }
    Ok(())
}
