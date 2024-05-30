mod server;
mod database;
mod error;

use std::env;
use serde_json::error::Category::Data;
pub use server::ServerConfig;
pub use database::DatabaseConfig;
pub use error::Error;

#[derive(Debug)]
pub struct Config {
    server:ServerConfig,
    database: DatabaseConfig
}

impl Config {
    pub fn from_env_file(file_name:&str) -> Result<Self,Error> {
        // Load environment variables from .env file.
        if let None = dotenvy::from_filename(file_name).ok() {
            tracing::error!("Failed to read file {file_name}");
            return Err(Error::FileDoesNotExist(file_name.to_string()));
        };

        Ok(Config {
            server: ServerConfig::from_env()?,
            database: DatabaseConfig::from_env()?
        })
    }

    pub fn server_config(&self) -> &ServerConfig {
        &self.server
    }

    pub fn database_config(&self) -> &DatabaseConfig {
        &self.database
    }
}

#[doc(hidden)]
/// helper function to get any port defined in the environment and parse to u16
fn get_env_port(env_var_name:&str, error:Error) -> Result<u16,Error> {
    let Ok(port_as_str) = env::var(env_var_name) else {
        return Err(error)
    };

    port_as_str.parse::<u16>().map_err(|_| {
        tracing::error!("Failed to convert {env_var_name} {port_as_str} to type u16.");
        error
    })
}

#[cfg(test)]
mod test {
    use crate::config::Config;

    #[test]
    fn read_env_file_success() {
        let x = Config::from_env_file(".env");
        println!("The x value: {x:#?}");

        assert!(true);
    }
}