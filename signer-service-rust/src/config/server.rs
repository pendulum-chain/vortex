use std::{
    env,
    net::SocketAddr,
};
use crate::config::{Error, try_get_port_from_env};

const SERVER_HOST:&str = "SERVER_HOST";
const SERVER_PORT:&str = "SERVER_PORT";

const DEFAULT_SERVER_HOST:&str = "127.0.0.1";
const DEFAULT_SERVER_PORT:u16 = 3001;

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
    pub(super) fn try_from_env() -> Result<Self,Error> {
        Ok(ServerConfig {
            host: env::var(SERVER_HOST).map_err(|_| Error::MissingServerHost)?,
            port: try_get_port_from_env(SERVER_PORT, Error::MissingServerPort)?
        })
    }

    pub fn socket_address(&self) -> Result<SocketAddr,Error> {
        let address = format!("{}:{}", self.host, self.port);
        // Parse the socket address
       address.parse()
            .map_err(|e| {
                tracing::error!("‼️{:<3} - Parsing Server Address:{address}: {e:?}", "FAILED");
                Error::ParseFailed("server address".to_string())
            })
    }
}
