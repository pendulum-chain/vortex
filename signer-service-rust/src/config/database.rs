use std::env;
use std::fmt::{Debug, Formatter};

use deadpool_diesel::postgres::{Manager,Pool};
use tracing::error;
use crate::config::{Error, try_get_port_from_env};

#[doc(hidden)]
const ENV_VAR_NAME_DATABASE_HOST:&str = "DATABASE_HOST";
#[doc(hidden)]
const ENV_VAR_NAME_DATABASE_PORT:&str = "DATABASE_PORT";
#[doc(hidden)]
const ENV_VAR_NAME_POSTGRES_USER:&str = "POSTGRES_USER";
#[doc(hidden)]
const ENV_VAR_NAME_POSTGRES_PASSWORD:&str = "POSTGRES_PASSWORD";

/// The configuration of the Postgres db
pub struct DatabaseConfig {
    host: String,
    port: u16,
    user: String,
    pass: String
}

impl Debug for DatabaseConfig {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DatabaseConfig")
            .field("host",&self.host)
            .field("port", &self.port)
            // display the first 2 letters of the username
            // and fill the remaining characters with ellipsis
            .field("user", &format!("{}...", &self.user.split_at(2).0))
            // password should be debug protected
            .field("pass",&"******")
            .finish()
    }
}

impl DatabaseConfig {
    /// Create new config via environment variables
    pub(super) fn try_from_env() -> Result<Self,Error> {
        Ok(DatabaseConfig{
            host: env::var(ENV_VAR_NAME_DATABASE_HOST).map_err(|_| Error::MissingDatabaseHost)?,
            port: try_get_port_from_env(ENV_VAR_NAME_DATABASE_PORT,Error::MissingDatabasePort)?,
            user: env::var(ENV_VAR_NAME_POSTGRES_USER).map_err(|_| Error::MissingDatabaseUser)?,
            pass: env::var(ENV_VAR_NAME_POSTGRES_PASSWORD).map_err(|_| Error::MissingDatabaseUser)?
        })
    }

    /// Create a connection pool for the Postgres database
    pub fn create_pool(&self) -> Result<Pool,Error> {
        let manager = Manager::new(
            self.url(),
            deadpool_diesel::Runtime::Tokio1
        );

        Pool::builder(manager).build().map_err(|e| {
            error!("‼️{:<6} - {e:?}", "FAILED");
            Error::ConnectionPoolError
        })
    }

    #[doc(hidden)]
    // Set to private, so as not to accidentally print the username and password somewhere else
    fn url(&self) -> String {
        format!("postgres://{}:{}@{}:{}/postgres",
            self.user,
            self.pass,
            self.host,
            self.port
        )
    }




}