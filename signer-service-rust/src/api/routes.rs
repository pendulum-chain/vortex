use axum::{debug_handler, Json, Router};
use axum::extract::State;
use axum::routing::get;
use serde_json::{json, Value};
use tokio::time::Instant;

use tracing::{info, warn};
use wallet::error::Error;
use wallet::{HorizonBalance, StellarWallet};

/*
// basic handler that responds with a static string
#[debug_handler]
pub async fn root() -> &'static str {
    "Hello, World!"
}
*/


#[debug_handler]
pub async fn stellar(State(wallet): State<StellarWallet>) {

}

#[debug_handler]
pub async fn status(State(wallet): State<StellarWallet>) -> Json<Value> {
    let start = Instant::now();

    let wallet_public_key = {
        let pub_key = wallet.public_key().to_encoding();
        String::from_utf8(pub_key).unwrap_or("undefined".to_string())
    };

    let res = match wallet.get_balances().await {
        Ok(balances) => _get_balance_success(&wallet_public_key, balances),
        Err(e) => {
            let e = e.to_string();
            warn!("⚠️{:<3} - Stellar Public Key {wallet_public_key} balances: {e}", "FAILED");

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
