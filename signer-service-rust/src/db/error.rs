use std::fmt;

use deadpool_diesel::InteractError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub enum Error {
    InternalServerError(String),
    NotFound,
    MigrationFailed,

    DoesNotExist(String),
    SerdeError(String),
    EncodingFailed(String)
}

pub fn adapt_infra_error<T: ErrorExt>(error: T) -> Error {
    error.as_infra_error()
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Error::NotFound => write!(f, "Not found"),
            Error::InternalServerError(e) => write!(f, "Internal server error: {}",e.to_string()),
            other => write!(f, "{:?}", other)
        }
    }
}

pub trait ErrorExt {
    fn as_infra_error(&self) -> Error;
}

impl ErrorExt for diesel::result::Error {
    fn as_infra_error(&self) -> Error {
        match self {
            diesel::result::Error::NotFound => Error::NotFound,
            other => { Error::InternalServerError(other.to_string()) },
        }
    }
}

impl ErrorExt for deadpool_diesel::PoolError {
    fn as_infra_error(&self) -> Error {
        Error::InternalServerError(self.to_string())
    }
}

impl ErrorExt for InteractError {
    fn as_infra_error(&self) -> Error {
        Error::InternalServerError(self.to_string())
    }
}