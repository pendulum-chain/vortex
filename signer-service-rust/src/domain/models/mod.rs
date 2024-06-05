mod token;
mod sep24Result;
pub mod requests;


use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use substrate_stellar_sdk::PublicKey;
use tracing::error;
pub use token::Token;
pub use sep24Result::Sep24Result;


#[derive(Debug, Serialize, Deserialize)]
pub enum Error {
    FileDoesNotExist(String),
    SerdeError(String),
    TokenDoesNotExist,
    EncodingFailed(String),

    WalletError(String),

    InvalidMemo
}

fn get_public_key_or_return_json_error(id:&str, name:&str) -> Result<PublicKey,Json<Value>> {
    PublicKey::from_encoding(id).map_err(|e|{
        error!("‼️{:<3} - Encoding {name} {id}: {e:?}", "FAILED");
        let error = Error::EncodingFailed(format!("{name}"));
        let error = format!("{error:?}");

        Json(json!({
            "status": 500,
            "error": "Server Error",
            "details": error
        }))

    })

}