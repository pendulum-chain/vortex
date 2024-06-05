
mod routes;

use axum::handler::Handler;
use axum::Router;
use axum::routing::{get, post};
use wallet::StellarWallet;
pub use routes::*;
use crate::config::AccountConfig;


// pub fn routes(account:&AccountConfig, wallet:StellarWallet) -> Router {
//     let status_router = Router::new().route("/status", get(status))
//         .with_state(wallet);
//
//     Router::new().nest("/v1",
//                        Router::new()
//                            .merge(status_router)
//                            .merge(stellar_routes(account))
//     )
// }

pub fn v1_routes(account:AccountConfig) -> Router {
    Router::new().nest(
        "/v1",
        status_route(account.clone())
            .merge(stellar_routes(account))
    )
}
fn status_route(account:AccountConfig) -> Router {
    Router::new().route("/status", get(status))
        .with_state(account)
}

fn stellar_routes(account:AccountConfig) -> Router {
    Router::new()
        .route("/stellar/create", post(create_account))
        .route("/stellar/payment", post(payment))
        .with_state(account)

}