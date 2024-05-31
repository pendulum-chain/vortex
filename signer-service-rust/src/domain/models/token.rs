use serde::{Deserialize, Serialize};
use substrate_stellar_sdk::{Asset, PublicKey};
use substrate_stellar_sdk::types::{AlphaNum12, AlphaNum4};

use tracing::{error, warn};
use crate::domain::models::Error;

#[derive(Debug, Serialize,Deserialize)]
pub struct Token {
    pub toml_url: String,
    pub asset_code: String,
    pub asset_issuer: String,
    pub vault_account_id: String,
    pub min_withdrawal_amount: String,
}

impl Token {
    pub fn try_from_path(path: &str) -> Result<Self,Error> {
        let read_file = std::fs::read_to_string(path)
            .map_err(|e| {
                error!("‼️{:<3} - Reading file {path}", "FAILED");

                Error::FileDoesNotExist(path.to_string())

            })?;

        serde_json::from_str(&read_file)
            .map_err(|e| {
                error!("‼️{:<3} - Deserializing to Token struct in file {path}: {e:?}", "FAILED");


                Error::SerdeError(format!("Token struct in file {path}"))
            })
    }

    pub fn try_by_asset_code(asset_code:&str) -> Result<Self,Error> {
        let asset_code = asset_code.to_uppercase();
        let path = format!("./resources/tokens/{asset_code}.json");

        Self::try_from_path(&path).map_err(|e| {
            match e {
                Error::FileDoesNotExist(_) => {
                    Error::TokenDoesNotExist
                }
                _ => e
            }
        })
    }

    pub fn asset_code_hex(&self) -> String {
        let mut hex = format!("0x{}", hex::encode(&self.asset_code));

        for _ in self.asset_code.len()..4 {
            hex = hex + "00";
        }

        hex
    }

    fn asset_issuer(&self) -> Result<PublicKey,Error> {
        PublicKey::from_encoding(&self.asset_issuer).map_err(|e|{
            error!("‼️{:<3} - Encoding asset issuer:{}: {e:?}", "FAILED", &self.asset_issuer);

            Error::EncodingFailed("asset issuer".to_string())
        })
    }

    pub fn get_asset_type(&self) -> Result<Asset,Error> {
        Ok(
            if self.asset_code.len() <= 4 {
                Asset::AssetTypeCreditAlphanum4(
                    AlphaNum4 {
                        asset_code: self.asset_code.clone().into(),
                        issuer: self.asset_issuer()?
                    }
                )
            } else {
                Asset::AssetTypeCreditAlphanum12(
                    AlphaNum12 {
                        asset_code: self.asset_code.clone().into(),
                        issuer: self.asset_issuer()?,
                    }
                )
            }
        )
    }
}

#[cfg(test)]
mod test {
    use crate::domain::models::Token;

    #[test]
    fn test_me() {
        let cfg = Token::try_by_asset_code("BRL");
        println!("The value of cfg: {cfg:?}");
        assert!(true);
    }
}