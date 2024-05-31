mod config;
pub mod infra;
mod api;
mod domain;
pub mod utils;

use axum::Router;
use axum::routing::get;
use tracing::info;
use tracing_subscriber::{
    filter::EnvFilter,
    fmt,
    layer::SubscriberExt,
    util::SubscriberInitExt
};
use wallet::StellarWallet;
use crate::api::routes::status;

pub struct State;
#[tokio::main]
async fn main() {
    init_tracing();

    let config = config::Config::try_from_env_file(".env").unwrap();
    let server_addr = config.server_config().socket_address().unwrap();
    let wallet = config.wallet_config().create_wallet().unwrap();


    let listener = tokio::net::TcpListener::bind(server_addr).await.unwrap();
    info!("🚀{:<3} - {:?}\n", "LISTENING", listener.local_addr());

    let routes = Router::new().route("/", get(root))
        .route("/status", get(status))
        .with_state(wallet);
    axum::serve(listener,routes).await.unwrap();
}

async fn root() -> &'static str {
    "Server is Running!"
}

/// initialize for logging purposes
fn init_tracing() {
    tracing_subscriber::registry()
        .with(fmt::layer())
        // will use the value of whatever the RUST_LOG environment variable has been set to.
        .with(EnvFilter::from_default_env())
        .init();


}