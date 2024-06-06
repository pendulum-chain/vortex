use axum::Json;
use axum::extract::State;
use serde_json::{json, Value};
use tokio::time::Instant;

use tracing::{info, warn};
use wallet::HorizonBalance;
use crate::api::{build_create_account_tx, build_payment_and_merge_tx, requests};
use crate::config::AccountConfig;

/// Performs POST /v1/stellar/create
pub(super) async fn create_account(
    State(funding_account): State<AccountConfig>,
    Json(payload): Json<requests::StellarCreateRequestBody>
) -> Json<Value> {
    info!("📦{:<3}: {payload:#?}","POST create payload");
    let start = Instant::now();

    let ephemeral_account_id = match payload.account_id_as_public_key() {
        Ok(id) => id,
        Err(result) => return result
    };

    let res = build_create_account_tx(
        &funding_account,
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
    info!("➡️{:<3} {duration:?}", "POST create");
    res
}

/// Performs POST /v1/stellar/payment
pub(super) async fn payment(
    State(funding_account): State<AccountConfig>,
    Json(payload): Json<requests::StellarPaymentRequestBody>
) -> Json<Value>  {
    info!("📦{:<3}: {payload:#?}","POST payment payload");

    let start = Instant::now();

    let ephemeral_account_id = match payload.account_id_as_public_key() {
        Ok(id) => id,
        Err(result) => return result
    };


    let res = build_payment_and_merge_tx(
        &funding_account,
        ephemeral_account_id,
        payload.sequence,
        payload.payment_data,
        payload.max_time,
        &payload.asset_code
    ).unwrap_or_else(|e|{
        Json(json!({
                "status": 500,
                "error": "Server Error",
                "details": e
            }))

    });

    let duration = start.elapsed();
    info!("➡️{:<3} {duration:?}", "POST payment");
    res
}


/// Performs GET /v1/status
pub(super) async fn status(State(account): State<AccountConfig>) -> Json<Value> {
    let start = Instant::now();

    let pub_key = account.public_key_as_str();
    let res = match account.get_balances().await {
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
    info!("➡️{:<3} {duration:?}", "GET status");
    res
}


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
        warn!("⚠️{:<3} - XLM balance of Stellar Public Key {public_key_as_str}\n", "NOT FOUND");
        return failed_status;
    };

    if native_balance.balance < 2.5 {
        warn!("⚠️{:<3} - XLM balance of Stellar Public Key {public_key_as_str}\n", "INSUFFICIENT");
        return failed_status;
    }

    info!("💰️{:<3} - Stellar Public Key {public_key_as_str} has sufficient XLM balance", "EXIST");
    Json(json!({
        "status": true,
        "public": public_key_as_str
    }))
}
