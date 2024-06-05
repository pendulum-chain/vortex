mod config;
pub mod infra;
mod api;
pub mod utils;

use tracing::info;
use tracing_subscriber::{
    filter::EnvFilter,
    fmt,
    layer::SubscriberExt,
    util::SubscriberInitExt
};
use crate::api::routes::{v1_routes};

pub struct State;
#[tokio::main]
async fn main() {
    init_tracing();

    let config = config::Config::try_from_env_file(".env").unwrap();
    let server_addr = config.server_config().socket_address().unwrap();

    let account_cfg = config.account_config();

    let listener = tokio::net::TcpListener::bind(server_addr).await.unwrap();
    info!("🚀{:<3} - {:?}\n", "LISTENING", listener.local_addr());

    axum::serve(listener,v1_routes(account_cfg)).await.unwrap();
}

/// initialize for logging purposes
fn init_tracing() {
    tracing_subscriber::registry()
        .with(fmt::layer())
        // will use the value of whatever the RUST_LOG environment variable has been set to.
        .with(EnvFilter::from_default_env())
        .init();


}