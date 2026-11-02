//! Types that cross the command boundary. Field names are camelCase on the wire
//! to match the TypeScript client (app/src/data/types.ts).

use serde::{Deserialize, Serialize};

use super::error::{DbError, DbResult};

/// Largest length the UI can represent exactly (JavaScript's Number.MAX_SAFE_INTEGER).
pub const MAX_TICKS: i64 = 9_007_199_254_740_991;
/// Generous ceilings for counts; anything above is a bug, not a cabinet.
pub const MAX_SHELVES: i64 = 1_000;
pub const MAX_QUANTITY: i64 = 100_000;

/// Version of the `ConstructionRules` JSON shape stored with each job. Version 2
/// added the construction `method` block; the app upgrades version 1 snapshots
/// when it reads them (app/src/data/rules.ts), so they are stored unchanged.
pub const RULES_VERSION: i64 = 2;

macro_rules! text_enum {
    ($name:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        pub enum $name {
            $(#[serde(rename = $text)] $variant),+
        }

        impl $name {
            pub fn as_str(self) -> &'static str {
                match self { $($name::$variant => $text),+ }
            }

            pub fn parse(text: &str) -> DbResult<Self> {
                match text {
                    $($text => Ok($name::$variant),)+
                    other => Err(DbError::Corrupt(format!(
                        "unknown {} value {other:?}", stringify!($name)
                    ))),
                }
            }
        }
    };
}

text_enum!(JobStatus {
    Draft => "draft",
    Ready => "ready",
    Completed => "completed",
    Archived => "archived",
});

text_enum!(CabinetType {
    Base => "base",
    Wall => "wall",
});

text_enum!(FinishedEnds {
    None => "none",
    Left => "left",
    Right => "right",
    Both => "both",
});

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cabinet {
    pub id: String,
    /// Shown on parts, e.g. "B1". The engine calls this the cabinet `id`.
    pub label: String,
    #[serde(rename = "type")]
    pub cabinet_type: CabinetType,
    /// Ticks.
    pub width: i64,
    pub height: i64,
    pub depth: i64,
    pub shelf_count: i64,
    pub finished_ends: FinishedEnds,
    pub quantity: i64,
    #[serde(default)]
    pub room: Option<String>,
    /// The run of base cabinets this one stands in (schema version 2). Separate from `room`.
    #[serde(default)]
    pub run: Option<String>,
}

impl Cabinet {
    /// Reject data the database must never hold. Values the engine merely flags
    /// (zero width, quantity 0 while typing) are allowed so in-progress work saves.
    pub fn check(&self) -> DbResult<()> {
        if self.id.trim().is_empty() {
            return Err(DbError::invalid("A cabinet is missing its id."));
        }
        let name = if self.label.trim().is_empty() { "A cabinet" } else { self.label.as_str() };
        for (label, value) in [("width", self.width), ("height", self.height), ("depth", self.depth)] {
            if value < 0 {
                return Err(DbError::invalid(format!("{name} has a negative {label}.")));
            }
            if value > MAX_TICKS {
                return Err(DbError::invalid(format!("{name} has a {label} too large to store.")));
            }
        }
        if !(0..=MAX_SHELVES).contains(&self.shelf_count) {
            return Err(DbError::invalid(format!(
                "{name} has {} shelves; the number must be between 0 and {MAX_SHELVES}.",
                self.shelf_count
            )));
        }
        if !(0..=MAX_QUANTITY).contains(&self.quantity) {
            return Err(DbError::invalid(format!(
                "{name} has a quantity of {}; it must be between 0 and {MAX_QUANTITY}.",
                self.quantity
            )));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub number: i64,
    pub name: String,
    pub customer: Option<String>,
    pub notes: Option<String>,
    pub status: JobStatus,
    /// The job's own `ConstructionRules`, snapshotted at creation.
    pub rules: serde_json::Value,
    pub rules_version: i64,
    pub created_at: String,
    pub updated_at: String,
    pub revision: i64,
    pub cabinets: Vec<Cabinet>,
}

/// Fields for a new job. Rules are never passed in: they come from shop settings.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewJob {
    pub name: String,
    #[serde(default)]
    pub customer: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobFields {
    pub name: String,
    pub customer: Option<String>,
    pub notes: Option<String>,
}

/// Everything the user edits in a job, saved as one snapshot. Cabinets are in
/// list order; cabinets missing from the list are deleted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSnapshot {
    pub id: String,
    pub name: String,
    pub customer: Option<String>,
    pub notes: Option<String>,
    pub status: JobStatus,
    pub cabinets: Vec<Cabinet>,
}

impl JobSnapshot {
    pub fn check(&self) -> DbResult<()> {
        let mut seen = std::collections::HashSet::new();
        for cabinet in &self.cabinets {
            cabinet.check()?;
            if !seen.insert(cabinet.id.as_str()) {
                return Err(DbError::invalid(format!(
                    "Cabinet {} appears twice in the job.",
                    cabinet.label
                )));
            }
        }
        Ok(())
    }
}

/// Result of any write that changes a job.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    pub revision: i64,
    pub updated_at: String,
}

/// Enough of a cabinet to draw a thumbnail in the job register.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CabinetOutline {
    pub label: String,
    #[serde(rename = "type")]
    pub cabinet_type: CabinetType,
    pub width: i64,
    pub height: i64,
    pub depth: i64,
    pub quantity: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobListItem {
    pub id: String,
    pub number: i64,
    pub name: String,
    pub customer: Option<String>,
    pub notes: Option<String>,
    pub status: JobStatus,
    pub created_at: String,
    pub updated_at: String,
    pub revision: i64,
    /// Number of cabinet rows (not multiplied by quantity).
    pub cabinet_count: i64,
    pub cabinets: Vec<CabinetOutline>,
}

/// A job whose journaled edits were applied at startup.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveredJob {
    pub job_id: String,
    pub job_name: String,
    pub revision: i64,
    pub updated_at: String,
}
