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

                let bytes: Hash = bytes.try_into().map_err(|e| {
                    error!("‼️{:<6} - Invalid offramp hash memo: {e:?}", "FAILED");
                    Error::InvalidMemo
                })?;

                Ok(Memo::MemoHash(bytes))
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

#[cfg(test)]
mod test {
    use base64::Engine;
    use substrate_stellar_sdk::Memo;
    use crate::api::Sep24Result;
    use base64::engine::general_purpose;

    fn test_sep24Result() -> Sep24Result {
        Sep24Result {
            amount: "1000000".to_string(),
            memo: "grJMNS9wmxB3ezp9qATcThV2Ov3LT7IShivbc9ZjLV4=".to_string(),
            memo_type: "hash".to_string(),
            offramping_account: "GDNVZLQ4TWVESLVNRWMMH3K6XILRZISHYMOIMGOSYQNRHPXPALX73OM2".to_string(),
        }
    }

    #[test]
    fn test_memo() {
        let mut sep24 = test_sep24Result();

        // --------------------- test hash memo ---------------------
        match sep24.memo().expect("should return a hash memo") {
            Memo::MemoHash(hash) => assert_eq!(
                general_purpose::STANDARD.encode(&hash),
                sep24.memo
            ),
            _ => assert!(false)
        }

        sep24.memo = "82b24c352f709b10777b3a7da804dc4e15763afdcb4fb212862bdb73d6632d5e".to_string();
        assert!(sep24.memo().is_err());

        // --------------------- test text memo ---------------------
        sep24.memo_type = "text".to_string();
        // exceeded max characters of 28
        assert!(sep24.memo().is_err());

        sep24.memo = "testing".to_string();
        match sep24.memo().expect("should return a text memo") {
            Memo::MemoText(text) => assert_eq!(
                std::str::from_utf8(text.get_vec()).expect("should return ok").to_string(),
                sep24.memo
            ),
            _ => assert!(false)
        }

        // --------------------- test non hash or text memo ---------------------
        sep24.memo_type = "id".to_string();
        assert!(sep24.memo().is_err());

        sep24.memo = "".to_string();
        assert!(sep24.memo().is_err());
    }


}