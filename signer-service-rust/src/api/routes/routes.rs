use axum::{debug_handler, Json};
use axum::extract::State;
use serde_json::{json, Value};
use tokio::time::Instant;

use tracing::{info, warn};
use wallet::{HorizonBalance, StellarWallet};
use crate::api::{build_create_account_tx, build_payment_and_merge_tx};
use crate::config::{AccountConfig, Error};

use crate::domain::models::requests;

pub(super) async fn create_account(
    State(funding_account): State<AccountConfig>,
    Json(payload): Json<requests::StellarCreateRequestBody>
) -> Json<Value> {
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
    info!("➡️ create {duration:?}");
    res
}

pub(super) async fn payment(
    State(funding_account): State<AccountConfig>,
    Json(payload): Json<requests::StellarPaymentRequestBody>
) -> Json<Value>  {
    info!("📦 {payload:#?}");

    let start = Instant::now();

    let ephemeral_account_id = match payload.account_id_as_public_key() {
        Ok(id) => id,
        Err(result) => return result
    };


    info!("  ephemeral_account_id: {ephemeral_account_id:?}");

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
    info!("➡️ payment {duration:?}");
    res
}

#[debug_handler]
pub(super) async fn status(State(account): State<AccountConfig>) -> Json<Value> {
    let start = Instant::now();

    let pub_key = account.public_key_as_str();
    let wallet = match account.create_wallet() {
        Ok(w) => w,
        Err(e) => {
            let e = format!("{e:?}");
            return Json(json!({
                "status": 500,
                "error": "Server Error",
                "details": e
            }));
        }
    };


    let res = match wallet.get_balances().await {
        Ok(balances) => _get_balance_success(&pub_key, balances),
        Err(e) => {
            let e = e.to_string();
            warn!("⚠️{:<3} - Stellar Public Key {pub_key} balances: {e}", "FAILED");

            Json(json!({
                "status": 500,
                "error": "Server Error",
                "details": e
            }))
        }
    };

    let duration = start.elapsed();
    info!("➡️ status {duration:?}");

    res
}


fn _get_balance_success(public_key:&str, balances: Vec<HorizonBalance>) -> Json<Value> {
    let failed_status = Json(json!({
                "status": false,
                "public": public_key
            }));

    let Some(native_balance) = balances.iter().find(|bal| {
        if let Ok(asset_type) = std::str::from_utf8(&bal.asset_type) {
            asset_type == "native"
        } else {
            false
        }
    }
    ) else {
        warn!("⚠️{:<3} - XLM balance of Stellar Public Key {public_key}\n", "NOT FOUND");
        return failed_status;
    };

    if native_balance.balance < 2.5 {
        warn!("⚠️{:<3} - XLM balance of Stellar Public Key {public_key}\n", "INSUFFICIENT");
        return failed_status;
    }

    info!("💰️{:<3} - Stellar Public Key {public_key} has sufficient XLM balance", "EXIST");
    Json(json!({
        "status": true,
        "public": public_key
    }))
}
