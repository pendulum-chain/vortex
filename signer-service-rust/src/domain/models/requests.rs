use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use substrate_stellar_sdk::PublicKey;
use crate::domain::models::{get_public_key_or_return_json_error, Sep24Result};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StellarPaymentRequestBody {
    pub account_id: String,
    pub sequence: i64,
    pub payment_data: Sep24Result,
    pub max_time: u64,
    pub asset_code: String,
}

impl StellarPaymentRequestBody {
    pub fn account_id_as_public_key(&self) -> Result<PublicKey, Json<Value>> {
        get_public_key_or_return_json_error(&self.account_id, "account_id")
    }
}

#[derive(Debug,Serialize,Deserialize)]
pub struct StellarCreateRequestBody {
    pub account_id: String,
    pub max_time: u64,
    pub asset_code: String
}

impl StellarCreateRequestBody {
    pub fn account_id_as_public_key(&self) -> Result<PublicKey, Json<Value>> {
        get_public_key_or_return_json_error(&self.account_id, "account_id")
    }
}