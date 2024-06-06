use std::fmt::Debug;
use serde::{Deserialize, Deserializer, Serialize};
use substrate_stellar_sdk::{Memo, PublicKey, StroopAmount};
use substrate_stellar_sdk::compound_types::LimitedString;
use tracing::error;
use crate::api::Error;
use crate::helper::de_str_to_i64;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sep24Result {
    pub amount: String,
    pub memo: String,
    pub memo_type: String,
    pub offramping_account: String,
}

impl Sep24Result {

    /// returns a [`Memo`] from the fields [`self.memo`] and [`self.memo_type`].
    /// [`self.memo_type`] can be a numeric String value
    /// derived from [`substrate_stellar_sdk::types::MemoType`]
    pub fn memo(&self) -> Result<Memo,Error>{
        let memo_type = self.memo_type.to_lowercase();

        match memo_type.as_str() {
            "1" | "text" | "memotext" => {
                let memo = self.memo.clone().into_bytes();
                Ok(Memo::MemoText(
                    LimitedString::new(memo)
                        .map_err(|e| {
                            error!("‼️{:<3} - Convert memo to type Memo: {e:?}", "FAILED");
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
                error!("‼️{:<3} - Unsupported offramp memo type: {:?}", "FAILED", self.memo_type);
                Err(Error::InvalidMemo)
            }
        }
    }

    /// returns offramping_account as [`PublicKey`]
    pub fn offramping_account_id(&self) -> Result<PublicKey,Error> {
        PublicKey::from_encoding(&self.offramping_account).map_err(|e| {
            error!("‼️{:<3} - Encoding offramping account {}: {e:?}", "FAILED", self.offramping_account);
            Error::EncodingFailed("offramping account".to_string())
        })
    }
    
    #[cfg(test)]
    pub fn new(
        amount: i64,
        memo: String,
        memo_type: String,
        offramping_account: String
    ) -> Self {
        Sep24Result {
            amount,
            memo,
            memo_type,
            offramping_account
        }
    }
}