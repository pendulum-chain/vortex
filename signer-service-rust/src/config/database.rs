use std::env;
use std::fmt::{Debug, Formatter};
use deadpool_diesel::Manager;
use crate::config::{Error, get_env_port};
use crate::infra;

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
    pub fn from_env() -> Result<Self,Error> {
        Ok(DatabaseConfig{
            host: env::var("DATABASE_HOST").map_err(|_| Error::MissingDatabaseHost)?,
            port: get_env_port("DATABASE_PORT",Error::MissingDatabasePort)?,
            user: env::var("POSTGRES_USER").map_err(|_| Error::MissingDatabaseUser)?,
            pass: env::var("POSTGRES_PASSWORD").map_err(|_| Error::MissingDatabaseUser)?
        })
    }

    /// Create a connection pool to the PostgreSQL database
    pub fn create_connection_pool<C:diesel::Connection>(&self) -> Manager<C> {
        Manager::new(
            self.url(),
            deadpool_diesel::Runtime::Tokio1
        )
    }

    // set to private, so as not to accidentally print the username and password somewhere else
    fn url(&self) -> String {
        format!("postgres://{}:{}@{}:{}/postgres",
            self.user,
            self.pass,
            self.host,
            self.port
        )
    }
}