pub mod routes;
mod routes_static;
mod routes_stellar;
mod horizon;

use crate::domain::models::Error as ModelsError;

#[derive(Debug)]
pub enum Error {
    ModelError(ModelsError),
    WalletError(String),
    OperationError(String),
    TransactionError(String)
}


impl From<ModelsError> for Error {
    fn from(value: ModelsError) -> Self {
        Self::ModelError(value)
    }
}