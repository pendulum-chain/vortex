
/// implementations of the routes
mod stellar_impls;
mod impls;

use axum::Router;
use axum::routing::{get, post};
use crate::api::routes::impls::tokens;
use crate::api::routes::stellar_impls::{create_account, payment, status};
use crate::AppState;

/// Returns /v1/... routes
pub fn v1_routes(state:AppState) -> Router {
    Router::new().nest(
        "/v1",
        first_level(state.clone())
            .merge(stellar_routes(state))
    )
}

/// contains the /status and /tokens
fn first_level(state:AppState) -> Router {
    Router::new()
        // GET /v1/status
        .route("/status", get(status))
        // GET /v1/tokens
        .route("/tokens", get(tokens))
        .with_state(state)
}

/// POST /v1/stellar/create and
/// POST /v1/stellar/payment
fn stellar_routes(state:AppState) -> Router {
    Router::new()
        .route("/stellar/create", post(create_account))
        .route("/stellar/payment", post(payment))
        .with_state(state)
}

