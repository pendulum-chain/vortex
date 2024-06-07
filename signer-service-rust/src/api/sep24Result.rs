use std::fmt::Debug;
use serde::{Deserialize, Serialize};
use substrate_stellar_sdk::{Memo, PublicKey};
use substrate_stellar_sdk::compound_types::LimitedString;
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
                let memo = self.memo.clone().into_bytes();
                Ok(Memo::MemoText(
                    LimitedString::new(memo)
                        .map_err(|e| {
                            error!("‼️{:<6} - Convert memo to type Memo: {e:?}", "FAILED");
                            Error::InvalidMemo
                        })?
                ))
            }
            "3" | "hash" | "memohash" => {
                let _memo  = self.memo.as_bytes();
                let mut memo = [0;32];
                memo[.._memo.len()].copy_from_slice(_memo);
                Ok(Memo::MemoHash(memo))
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