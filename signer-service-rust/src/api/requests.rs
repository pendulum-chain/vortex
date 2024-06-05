use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use substrate_stellar_sdk::PublicKey;
use tracing::error;
use crate::api::Sep24Result;

/// Request Body of [crate::api::routes::create_account()]
/// with api: POST /v1/stellar/create
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StellarCreateRequestBody {
    pub account_id: String,
    pub max_time: u64,
    pub asset_code: String
}

impl StellarCreateRequestBody {
    /// returns the account id as [`PublicKey`], or an error in [`Json`] format
    pub fn account_id_as_public_key(&self) -> Result<PublicKey, Json<Value>> {
        get_public_key_or_return_json_error(&self.account_id, "account_id")
    }
}

/// Request Body of [crate::api::routes::payment()]
/// with api: POST /v1/stellar/create
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StellarPaymentRequestBody {
    pub account_id: String,
    pub sequence: i64,
    pub payment_data: Sep24Result,
    pub max_time: u64,
    pub asset_code: String,
}

impl StellarPaymentRequestBody {
    /// returns the account id as [`PublicKey`], or an error in [`Json`] format
    pub fn account_id_as_public_key(&self) -> Result<PublicKey, Json<Value>> {
        get_public_key_or_return_json_error(&self.account_id, "account_id")
    }
}

fn get_public_key_or_return_json_error(id:&str, name:&str) -> Result<PublicKey,Json<Value>> {
    PublicKey::from_encoding(id).map_err(|e|{
        error!("‼️{:<3} - Encoding {name} {id}: {e:?}", "FAILED");
        let error = format!("Encoding Failed: {name}");

        Json(json!({
            "status": 500,
            "error": "Server Error",
            "details": error
        }))
    })
}