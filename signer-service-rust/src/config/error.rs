use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub enum Error {
    FileDoesNotExist(String),

    MissingServerHost,
    MissingServerPort,

    MissingDatabaseHost,
    MissingDatabasePort,
    MissingDatabaseUser,
    MissingDatabasePassword,

    MissingStellarSecretKey,
    MissingStellarNetworkIdentifier,
    CreateWalletFailed,
    ParseFailed(String)
}