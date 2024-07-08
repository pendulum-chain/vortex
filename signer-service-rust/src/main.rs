mod config;
mod infra;
mod api;

#[doc(hidden)]
pub mod helper;

use deadpool_diesel::postgres::Pool;
use tracing::info;
use tracing_subscriber::{
    filter::EnvFilter,
    fmt,
    layer::SubscriberExt,
    util::SubscriberInitExt
};
use crate::api::routes::{v1_routes};
use crate::config::AccountConfig;
use crate::infra::run_migrations;

/// Application State that can be shared amongst routes
#[derive(Clone)]
pub struct AppState {
    pub connection_pool: Pool,
    pub account: AccountConfig
}

#[tokio::main]
async fn main() {
    init_tracing();

    let config = config::Config::try_from_env_file(".env").unwrap();

    let db_cfg = config.database_config();
    let connection_pool = db_cfg.create_pool().unwrap();
    run_migrations(&connection_pool).await.unwrap();

    let server_addr = config.server_config().socket_address().unwrap();
    let listener = tokio::net::TcpListener::bind(server_addr).await.unwrap();
    info!("🚀{:<6} - {:?}\n", "LISTENING", listener.local_addr());

    let state = AppState {
        connection_pool,
        account: config.account_config(),
    };
    axum::serve(listener,v1_routes(state)).await.unwrap();
}

/// initializes logging
fn init_tracing() {
    tracing_subscriber::registry()
        .with(fmt::layer())
        // will use the value of whatever the RUST_LOG environment variable has been set to.
        .with(EnvFilter::from_default_env())
        .init();
}
