mod routes;

use axum::Router;
use axum::routing::{get, post};
use crate::api::routes::routes::{create_account, payment, status};
use crate::config::AccountConfig;

/// Returns /v1/... routes
pub fn v1_routes(account:AccountConfig) -> Router {
    Router::new().nest(
        "/v1",
        status_route(account.clone())
            .merge(stellar_routes(account))
    )
}

/// GET /v1/status
fn status_route(account:AccountConfig) -> Router {
    Router::new().route("/status", get(status))
        .with_state(account)
}

/// POST /v1/stellar/create and
/// POST /v1/stellar/payment
fn stellar_routes(account:AccountConfig) -> Router {
    Router::new()
        .route("/stellar/create", post(create_account))
        .route("/stellar/payment", post(payment))
        .with_state(account)

}