

#[derive(Debug)]
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