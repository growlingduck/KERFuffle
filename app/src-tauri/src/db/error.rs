use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

pub type DbResult<T> = Result<T, DbError>;

/// Storage errors. Each one serializes to `{ kind, message }` for the UI, where
/// `message` is plain language a shop user can act on.
#[derive(Debug, Clone, thiserror::Error)]
pub enum DbError {
    #[error("That job no longer exists. It may have been deleted.")]
    JobNotFound,
    #[error("That cabinet no longer exists in this job.")]
    CabinetNotFound,
    /// Data the database must never hold, e.g. a negative size.
    #[error("{0}")]
    Invalid(String),
    #[error("The job database is busy. Try again in a moment.")]
    Busy,
    #[error("The disk is full, so changes can't be saved. Free up some space and try again.")]
    DiskFull,
    #[error("KERFuffle can't write to its data folder. Check that the folder isn't read-only.")]
    ReadOnly,
    #[error("The job database is damaged. Restore a backup from Settings.")]
    Corrupt(String),
    #[error(
        "This job database was made by a newer version of KERFuffle (schema {found}; this version reads up to {supported}). Update KERFuffle to open it."
    )]
    NewerSchema { found: i64, supported: i64 },
    /// The database could not be opened at startup; every command reports this.
    #[error("The job database couldn't be opened: {0}")]
    Unavailable(String),
    /// A backup or restore that didn't complete. The message says what is unchanged.
    #[error("{0}")]
    Backup(String),
    #[error("Something went wrong saving to the job database: {0}")]
    Storage(String),
}

impl DbError {
    pub fn kind(&self) -> &'static str {
        match self {
            DbError::JobNotFound | DbError::CabinetNotFound => "notFound",
            DbError::Invalid(_) => "invalid",
            DbError::Busy => "busy",
            DbError::DiskFull => "diskFull",
            DbError::ReadOnly => "readOnly",
            DbError::Corrupt(_) => "corrupt",
            DbError::NewerSchema { .. } => "newerDatabase",
            DbError::Unavailable(_) => "unavailable",
            DbError::Backup(_) => "backup",
            DbError::Storage(_) => "storage",
        }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        DbError::Invalid(message.into())
    }
}

impl From<rusqlite::Error> for DbError {
    fn from(error: rusqlite::Error) -> Self {
        use rusqlite::ErrorCode;
        if let rusqlite::Error::SqliteFailure(failure, _) = &error {
            match failure.code {
                ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked => return DbError::Busy,
                ErrorCode::DiskFull => return DbError::DiskFull,
                ErrorCode::ReadOnly | ErrorCode::CannotOpen | ErrorCode::PermissionDenied => {
                    return DbError::ReadOnly
                }
                ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase => {
                    return DbError::Corrupt(error.to_string())
                }
                ErrorCode::ConstraintViolation => {
                    return DbError::Invalid(format!(
                        "The change was refused because it would break the job's data ({error})."
                    ))
                }
                _ => {}
            }
        }
        DbError::Storage(error.to_string())
    }
}

impl From<std::io::Error> for DbError {
    fn from(error: std::io::Error) -> Self {
        match error.kind() {
            std::io::ErrorKind::PermissionDenied => DbError::ReadOnly,
            _ => DbError::Storage(error.to_string()),
        }
    }
}

impl From<serde_json::Error> for DbError {
    fn from(error: serde_json::Error) -> Self {
        DbError::Corrupt(format!("stored JSON could not be read: {error}"))
    }
}

impl Serialize for DbError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("DbError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}
