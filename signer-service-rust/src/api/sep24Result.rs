use std::fmt::Debug;
use base64::Engine;
use base64::engine::general_purpose;
use serde::{Deserialize, Serialize};
use substrate_stellar_sdk::{Hash, Memo, PublicKey};
use tracing::error;
use crate::api::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sep24Result {
    pub amount: String,
    pub memo: String,
    /// Can be a numeric String value based on [`substrate_stellar_sdk::types::MemoType`]
    pub memo_type: String,
    pub offramping_account: String,
}

impl Sep24Result {

    /// returns a [`Memo`] derived from the fields `memo` and `memo_type`.
    pub fn memo(&self) -> Result<Memo,Error>{
        let memo_type = self.memo_type.to_lowercase();

        match memo_type.as_str() {
            "1" | "text" | "memotext" => {
                Memo::from_text_memo(self.memo.clone()).map_err(|e| {
                    error!("‼️{:<6} - Invalid offramp text memo: {e:?}", "FAILED");
                    Error::InvalidMemo
                } )
            }
            "3" | "hash" | "memohash" => {
                // base64 decode
                let bytes = general_purpose::STANDARD
                    .decode(self.memo.as_bytes()).map_err(|e| {
                    error!("‼️{:<6} - Invalid offramp hash memo: {e:?}", "FAILED");
                    Error::InvalidMemo
                })?;

                Memo::from_hash_memo::<Hash>(bytes.try_into().unwrap()).map_err(|e| {
                    error!("‼️{:<6} - Invalid offramp hash memo: {e:?}", "FAILED");
                    Error::InvalidMemo
                })
            }
            _ => {
                error!("‼️{:<6} - Unsupported offramp memo type: {:?}", "FAILED", self.memo_type);
                Err(Error::InvalidMemo)
            }
        }
    }

    /// returns offramping_account as [`PublicKey`]
    pub fn offramping_account_id(&self) -> Result<PublicKey,Error> {
        PublicKey::from_encoding(&self.offramping_account).map_err(|e| {
            error!("‼️{:<6} - Encoding offramping account {}: {e:?}", "FAILED", self.offramping_account);
            Error::EncodingFailed("offramping account".to_string())
        })
    }
}