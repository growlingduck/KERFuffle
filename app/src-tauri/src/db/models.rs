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
    /// The job's material for each slot, with a copy of each (schema version 3).
    /// None: made before materials; the app fills in the shop defaults.
    #[serde(default)]
    pub materials: Option<serde_json::Value>,
    /// The job's copy of its saw profile (schema version 4). None: made before
    /// saw profiles; the app uses the shop's default profile.
    #[serde(default)]
    pub saw_profile: Option<serde_json::Value>,
    /// Sheet layouts kept with the job, one per material (schema version 5).
    /// Empty: none kept; the app lays the job out as needed.
    #[serde(default)]
    pub layouts: Vec<SavedLayout>,
}

/// A sheet layout kept with a job (`layouts` table). The app writes and reads
/// `layout`; the database checks only that it is there and whose it is.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedLayout {
    pub material_id: String,
    /// The app's hash of the material's pieces, sheet size and seed.
    pub input_hash: String,
    /// The optimizer's ALGORITHM_VERSION that made it.
    pub algorithm_version: i64,
    /// cost, grain or time.
    pub mode: String,
    /// The saw profile it was cut for.
    pub profile: serde_json::Value,
    /// The material's layout, as the optimizer gave it.
    pub layout: serde_json::Value,
    pub created_at: String,
}

/// Saved layouts: one per material, each complete and for its own material.
pub fn check_layouts(layouts: &[SavedLayout]) -> DbResult<()> {
    let mut seen = std::collections::HashSet::new();
    for layout in layouts {
        let for_material = layout.layout.get("material").and_then(|m| m.get("id")).and_then(serde_json::Value::as_str);
        let ok = !layout.material_id.trim().is_empty()
            && !layout.input_hash.is_empty()
            && layout.algorithm_version >= 0
            && matches!(layout.mode.as_str(), "cost" | "grain" | "time")
            && !layout.created_at.is_empty()
            && for_material == Some(layout.material_id.as_str())
            && layout.layout.get("patterns").is_some_and(serde_json::Value::is_array);
        if !ok {
            return Err(DbError::invalid("A sheet layout is incomplete."));
        }
        check_saw_profile(&layout.profile)?;
        if !seen.insert(layout.material_id.as_str()) {
            return Err(DbError::invalid("A material has two sheet layouts."));
        }
    }
    Ok(())
}

text_enum!(MethodId {
    A => "A",
    B => "B",
});

text_enum!(BaseType {
    Ladder => "ladder",
    Legs => "legs",
});

/// The construction chosen in the New job dialog: method A on a ladder base or
/// on legs, or method B. Every other method setting comes from shop settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructionChoice {
    pub id: MethodId,
    pub base_type: BaseType,
}

/// Fields for a new job. Rules are never passed in: they come from shop settings,
/// with the construction choice applied.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewJob {
    pub name: String,
    #[serde(default)]
    pub customer: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    /// None: the shop's default method.
    #[serde(default)]
    pub construction: Option<ConstructionChoice>,
    /// The materials the app chose from the shop defaults, with their copies.
    #[serde(default)]
    pub materials: Option<serde_json::Value>,
    /// A copy of the shop's default saw profile.
    #[serde(default)]
    pub saw_profile: Option<serde_json::Value>,
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
    /// The job's construction rules, in the current shape (`RULES_VERSION`).
    /// Present only when they changed (the construction method was changed),
    /// which is allowed only while the job is a draft. Absent: unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rules: Option<serde_json::Value>,
    /// The job's materials by slot. Absent: unchanged (a job made before
    /// materials keeps none until one is chosen).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub materials: Option<serde_json::Value>,
    /// The job's saw profile copy. Absent: unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub saw_profile: Option<serde_json::Value>,
}

/// A saw profile copy: an id and a name, and its sizes whole, non-negative ticks.
pub fn check_saw_profile(profile: &serde_json::Value) -> DbResult<()> {
    let text = |key: &str| profile.get(key).and_then(serde_json::Value::as_str).is_some_and(|t| !t.trim().is_empty());
    let size = |key: &str| profile.get(key).and_then(serde_json::Value::as_i64).is_some_and(|n| n >= 0);
    let ok = profile.is_object()
        && text("id")
        && text("name")
        && ["kerf", "edgeTrim", "minPiece", "keepLength", "keepWidth", "extraSheets"].iter().all(|k| size(k))
        && matches!(profile.get("firstCut").and_then(serde_json::Value::as_str), Some("length" | "width" | "either"));
    if ok {
        Ok(())
    } else {
        Err(DbError::invalid("The job's saw profile is incomplete."))
    }
}

/// Job materials are an object of slots, each a material copy with an id.
pub fn check_job_materials(materials: &serde_json::Value) -> DbResult<()> {
    let slots = materials.get("slots").and_then(serde_json::Value::as_object);
    let ok = slots.is_some_and(|slots| {
        slots.values().all(|m| m.get("id").and_then(serde_json::Value::as_str).is_some_and(|id| !id.is_empty()))
    });
    if ok {
        Ok(())
    } else {
        Err(DbError::invalid("The job's materials are incomplete."))
    }
}

impl JobSnapshot {
    pub fn check(&self) -> DbResult<()> {
        if let Some(materials) = &self.materials {
            check_job_materials(materials)?;
        }
        if let Some(profile) = &self.saw_profile {
            check_saw_profile(profile)?;
        }
        if let Some(rules) = &self.rules {
            if !rules.is_object() || !rules.get("method").is_some_and(serde_json::Value::is_object) {
                return Err(DbError::invalid("The job's construction settings are incomplete."));
            }
        }
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

text_enum!(MaterialKind {
    Sheet => "sheet",
    Laminate => "laminate",
    Banding => "banding",
    Hardware => "hardware",
});

text_enum!(MaterialGrain {
    None => "none",
    Length => "length",
});

/// One material in the shop's catalog. Sizes are ticks, prices whole cents.
/// Fields a kind doesn't use are stored empty (see `Material::normalized`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Material {
    pub id: String,
    pub kind: MaterialKind,
    pub name: String,
    #[serde(default)]
    pub thickness: Option<i64>,
    #[serde(default)]
    pub length: Option<i64>,
    #[serde(default)]
    pub width: Option<i64>,
    #[serde(default = "no_grain")]
    pub grain: MaterialGrain,
    #[serde(default)]
    pub banding_width: Option<i64>,
    #[serde(default)]
    pub roll_feet: Option<i64>,
    #[serde(default)]
    pub unit: Option<String>,
    /// Cents per sheet, foot (or roll), or item. None: needs a price.
    #[serde(default)]
    pub price: Option<i64>,
    #[serde(default)]
    pub supplier: Option<String>,
    #[serde(default)]
    pub sku: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub on_hand: Option<i64>,
    #[serde(default)]
    pub archived: bool,
    /// Set by the database.
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

fn no_grain() -> MaterialGrain {
    MaterialGrain::None
}

/// Largest price the UI handles: a billion dollars, in cents.
pub const MAX_PRICE_CENTS: i64 = 100_000_000_000;
pub const MAX_ON_HAND: i64 = 1_000_000;

impl Material {
    /// Only the fields the kind uses: sheet goods have a thickness, size and
    /// grain; laminate a size and grain; banding a width and roll; hardware a unit.
    pub fn normalized(&self) -> Material {
        let mut m = self.clone();
        let sheet = m.kind == MaterialKind::Sheet;
        let sized = sheet || m.kind == MaterialKind::Laminate;
        if !sheet {
            m.thickness = None;
        }
        if !sized {
            m.length = None;
            m.width = None;
            m.grain = MaterialGrain::None;
        }
        if m.kind != MaterialKind::Banding {
            m.banding_width = None;
            m.roll_feet = None;
        }
        if m.kind != MaterialKind::Hardware {
            m.unit = None;
        }
        let blank = |text: &mut Option<String>| {
            if text.as_deref().is_some_and(|t| t.trim().is_empty()) {
                *text = None;
            }
        };
        blank(&mut m.unit);
        blank(&mut m.supplier);
        blank(&mut m.sku);
        blank(&mut m.notes);
        m.name = m.name.trim().to_string();
        m
    }

    /// Reject what the catalog must never hold. Call on a normalized material.
    pub fn check(&self) -> DbResult<()> {
        if self.id.trim().is_empty() {
            return Err(DbError::invalid("A material is missing its id."));
        }
        if self.name.trim().is_empty() {
            return Err(DbError::invalid("A material needs a name."));
        }
        let name = self.name.as_str();
        let size = |label: &str, value: Option<i64>, required: bool| -> DbResult<()> {
            match value {
                None if required => Err(DbError::invalid(format!("{name} needs a {label}."))),
                Some(v) if v <= 0 || v > MAX_TICKS => Err(DbError::invalid(format!("{name} has an impossible {label}."))),
                _ => Ok(()),
            }
        };
        let sheet = self.kind == MaterialKind::Sheet;
        let sized = sheet || self.kind == MaterialKind::Laminate;
        size("thickness", self.thickness, sheet)?;
        size("sheet length", self.length, sized)?;
        size("sheet width", self.width, sized)?;
        size("width", self.banding_width, false)?;
        if self.roll_feet.is_some_and(|f| f <= 0 || f > MAX_ON_HAND) {
            return Err(DbError::invalid(format!("{name} has an impossible roll length.")));
        }
        if self.price.is_some_and(|p| !(0..=MAX_PRICE_CENTS).contains(&p)) {
            return Err(DbError::invalid(format!("{name} has an impossible price.")));
        }
        if self.on_hand.is_some_and(|n| !(0..=MAX_ON_HAND).contains(&n)) {
            return Err(DbError::invalid(format!("{name} has an impossible count on hand.")));
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
