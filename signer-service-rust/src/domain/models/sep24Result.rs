use std::fmt::Debug;
use serde::{Deserialize, Serialize};
use substrate_stellar_sdk::{Memo, PublicKey, StroopAmount};
use substrate_stellar_sdk::compound_types::LimitedString;
use tracing::error;
use crate::domain::models::Error;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sep24Result {
    pub amount: i64,
    pub memo: String,
    pub memo_type: String,
    pub offramping_account: String,
}

impl Sep24Result {
    pub fn amount(&self) -> StroopAmount {
        StroopAmount(self.amount)
    }
    
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
    
    pub fn offramping_account(&self) -> Result<PublicKey,Error> {
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
