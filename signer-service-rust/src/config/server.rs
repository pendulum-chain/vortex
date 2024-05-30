use std::{
    env::{self, VarError},
    net::SocketAddr,
    path::Path
};
use crate::config::{Error, get_env_port};
use crate::config::Error::MissingServerPort;

const DEFAULT_SERVER_HOST:&str = "127.0.0.1";
const DEFAULT_SERVER_PORT:u16 = 3000;

/// Holds the address of our server
#[derive(Debug)]
pub struct ServerConfig {
    host: String,
    port: u16
}

impl Default for ServerConfig {
    fn default() -> Self {
        ServerConfig {
            host: DEFAULT_SERVER_HOST.to_string(),
            port: DEFAULT_SERVER_PORT,
        }
    }
}

impl ServerConfig {
    pub fn from_env() -> Result<Self,Error> {
        Ok(ServerConfig {
            host: env::var("SERVER_HOST").map_err(|_| Error::MissingServerHost)?,
            port: get_env_port("SERVER_PORT", MissingServerPort)?
        })
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn socket_address(&self) -> Result<SocketAddr,Error> {
        let address = format!("{}:{}", self.host, self.port);
        // Parse the socket address
       address.parse()
            .map_err(|e| {
                tracing::error!("Failed to parse address {address}: {e:?}");
                Error::ParseFailed("server address".to_string())
            })
    }
}
