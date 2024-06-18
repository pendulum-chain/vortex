use axum::Json;
use axum::extract::State;
use serde_json::{json, Value};
use tokio::time::Instant;

use tracing::{info, warn};
use wallet::HorizonBalance;
use crate::api::{build_create_account_tx, build_payment_and_merge_tx, requests};
use crate::AppState;

const XLM_BALANCE_MINIMUM_MARGIN: f64 = 2.5;

/// Performs POST /v1/stellar/create and requires [`StellarCreateRequestBody`] request body
/// Calls the function [`build_create_account_tx`]
pub(super) async fn create_account(
    State(state): State<AppState>,
    Json(payload): Json<requests::StellarCreateRequestBody>
) -> Json<Value> {
    info!("📦{:<6}: {payload:#?}","POST create payload");
    let start = Instant::now();

    let ephemeral_account_id = match payload.account_id_as_public_key() {
        Ok(id) => id,
        Err(result) => return result
    };

    let res = build_create_account_tx(
        &state.account,
        &ephemeral_account_id,
        &payload.asset_code,
        payload.max_time
    ).await
        .unwrap_or_else(|e|{
            Json(json!({
                "status": 500,
                "error": "Server Error",
                "details": e
            }))

        });

    let duration = start.elapsed();
    info!("➡️ {:<6} {duration:?}", "POST create");
    res
}

/// Performs POST /v1/stellar/payment and requires [`StellarPaymentRequestBody`] request body
/// Calls the function [`build_payment_and_merge_tx`]
pub(super) async fn payment(
    State(state): State<AppState>,
    Json(payload): Json<requests::StellarPaymentRequestBody>
) -> Json<Value>  {
    info!("📦{:<6}: {payload:#?}","POST payment payload");

    let start = Instant::now();

    let ephemeral_account_id = match payload.account_id_as_public_key() {
        Ok(id) => id,
        Err(result) => return result
    };


    let res = build_payment_and_merge_tx(
        &state.account,
        ephemeral_account_id,
        payload.sequence,
        &payload.asset_code,
        payload.max_time,
        payload.payment_data,
    ).await.unwrap_or_else(|e|{
        Json(json!({
                "status": 500,
                "error": "Server Error",
                "details": e
            }))

    });

    let duration = start.elapsed();
    info!("➡️ {:<6} {duration:?}", "POST payment");
    res
}

/// Performs GET /v1/status returns the [`PublicKey`](substrate_stellar_sdk::PublicKey) (in [`String`] format) of the funding account
/// defined in the environment variable `STELLAR_SECRET_KEY`
pub(super) async fn status(State(state): State<AppState>) -> Json<Value> {
    let start = Instant::now();

    let pub_key = state.account.public_key_as_str();
    let res = match state.account.get_balances().await {
        Ok(balances) => _get_balance_success(&pub_key, balances),
        Err(e) => {
            let e = format!("{e:?}");
            Json(json!({
                "status": 500,
                "error": "Server Error",
                "details": e
            }))
        }
    };

    let duration = start.elapsed();
    info!("➡️ {:<6} {duration:?}", "GET status");
    res
}

#[doc(hidden)]
fn _get_balance_success(public_key_as_str:&str, balances: Vec<HorizonBalance>) -> Json<Value> {
    let failed_status = Json(json!({
                "status": false,
                "public": public_key_as_str
            }));

    let Some(native_balance) = balances.iter().find(|bal| {
        if let Ok(asset_type) = std::str::from_utf8(&bal.asset_type) {
            asset_type == "native"
        } else {
            false
        }
    }
    ) else {
        warn!("⚠️{:<6} - XLM balance of Stellar Public Key {public_key_as_str}\n", "NOT FOUND");
        return failed_status;
    };

    if native_balance.balance < XLM_BALANCE_MINIMUM_MARGIN {
        warn!("⚠️{:<6} - XLM balance of Stellar Public Key {public_key_as_str}\n", "INSUFFICIENT");
        return failed_status;
    }

    info!("💰️{:<6} - Stellar Public Key {public_key_as_str} has sufficient XLM balance", "EXIST");
    Json(json!({
        "status": true,
        "public": public_key_as_str
    }))
}
