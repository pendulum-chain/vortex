pub mod routes;
mod routes_static;
mod horizon;


use serde::{Deserialize, Serialize};
use crate::domain::models::Error as ModelsError;
use crate::config::Error as ConfigError;

pub(super) use horizon::{build_create_account_tx, build_payment_and_merge_tx};

#[derive(Debug, Serialize, Deserialize)]
pub enum Error {
    ModelError(ModelsError),
    OperationError(String),
    TransactionError(String),
    ConfigError(ConfigError)
}

impl From<ModelsError> for Error {
    fn from(value: ModelsError) -> Self {
        Self::ModelError(value)
    }
}

impl From<ConfigError> for Error {
    fn from(value: ConfigError) -> Self {
        Self::ConfigError(value)
    }
}