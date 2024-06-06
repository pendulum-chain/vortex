use std::fmt;

use deadpool_diesel::InteractError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub enum Error {
    InternalServerError,
    NotFound,

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
            Error::InternalServerError => write!(f, "Internal server error"),
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
            _ => Error::InternalServerError,
        }
    }
}

impl ErrorExt for deadpool_diesel::PoolError {
    fn as_infra_error(&self) -> Error {
        Error::InternalServerError
    }
}

impl ErrorExt for InteractError {
    fn as_infra_error(&self) -> Error {
        Error::InternalServerError
    }
}