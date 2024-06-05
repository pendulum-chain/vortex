pub mod routes;
mod horizon;
mod sep24Result;
pub mod requests;

pub use sep24Result::Sep24Result;


use serde::{Deserialize, Serialize};
use crate::config::Error as ConfigError;
use crate::infra::Error as InfraError;

pub(super) use horizon::{build_create_account_tx, build_payment_and_merge_tx};

#[derive(Debug, Serialize, Deserialize)]
pub enum Error {
    InvalidMemo,
    EncodingFailed(String),
    OperationError(String),
    TransactionError(String),
    ConfigError(ConfigError),
    InfraError(InfraError)
}

impl From<ConfigError> for Error {
    fn from(value: ConfigError) -> Self {
        Self::ConfigError(value)
    }
}

impl From<InfraError> for Error {
    fn from(value: InfraError) -> Self {
        Self::InfraError(value)
    }
}
