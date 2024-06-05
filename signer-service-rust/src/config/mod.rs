mod server;
mod database;
mod error;
mod account;

use std::env;
pub use server::ServerConfig;
pub use database::DatabaseConfig;
pub use account::AccountConfig;
pub use error::Error;

use tracing::error;

#[derive(Debug)]
pub struct Config {
    server:ServerConfig,
    database: DatabaseConfig,
    account: AccountConfig
}

impl Config {
    pub fn try_from_env_file(file_name:&str) -> Result<Self,Error> {
        // Load environment variables from .env file.
        if let None = dotenvy::from_filename(file_name).ok() {
            error!("‼️{:<3} - Reading file {file_name}", "FAILED");
            return Err(Error::FileDoesNotExist(file_name.to_string()));
        };

        Ok(Config {
            server: ServerConfig::try_from_env()?,
            database: DatabaseConfig::try_from_env()?,
            account: AccountConfig::try_from_env()?
        })
    }

    pub fn server_config(&self) -> &ServerConfig {
        &self.server
    }

    pub fn database_config(&self) -> &DatabaseConfig {
        &self.database
    }

    pub fn account_config(&self) -> AccountConfig { self.account.clone() }
}

#[doc(hidden)]
/// helper function to get any port defined in the environment and parse to u16
fn try_get_port_from_env(env_var_name:&str, error:Error) -> Result<u16,Error> {
    let Ok(port_as_str) = env::var(env_var_name) else {
        return Err(error)
    };

    port_as_str.parse::<u16>().map_err(|_| {
        error!("‼️{:<3} - Convert {env_var_name} {port_as_str} to u16", "FAILED");
        error
    })
}