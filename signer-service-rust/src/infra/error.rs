use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub enum Error {
    InternalServerError,
    NotFound,
    PoolError,

    TokenDoesNotExist,
    DoesNotExist(String),
    EncodingFailed(String),
    SerdeError(String),
}