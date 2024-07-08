use serde::{Deserialize, Serialize};
use substrate_stellar_sdk::{Asset, PublicKey};
use substrate_stellar_sdk::types::{AlphaNum12, AlphaNum4};
use tracing::error;
use crate::api::Error;

#[derive(PartialEq, Clone, Debug, Serialize,Deserialize)]
pub struct Token {
    pub asset_code: String,
    pub asset_issuer: String,
    pub vault_account_id: String,
    pub toml_url: String,
    pub min_withdrawal_amount: Option<String>,
}

impl Token {
    /// Returns a Token based on a supported asset_code
    pub fn try_by_asset_code(asset_code:&str) -> Result<Token,Error> {
        let asset_code = asset_code.to_uppercase();
        let path = format!("./resources/tokens/{asset_code}.json");

        Self::try_from_path(&path).map_err(|e| {
            match e {
                Error::DoesNotExist(_) => {
                    Error::DoesNotExist(asset_code)
                }
                _ => e
            }
        })
    }

    #[doc(hidden)]
    /// Returns a Token by reading from a json file
    pub fn try_from_path(path: &str) -> Result<Self,Error> {
        let read_file = std::fs::read_to_string(path)
            .map_err(|_| {
                error!("‼️{:<6} - Reading file {path}", "FAILED");
                Error::DoesNotExist(path.to_string())
            })?;

        serde_json::from_str(&read_file)
            .map_err(|e| {
                error!("‼️{:<6} - Deserializing to Token struct in file {path}: {e:?}", "FAILED");
                Error::SerdeError(format!("Token struct in file {path}"))
            })
    }

    pub fn asset_code_hex(&self) -> String {
        let asset_code = self.asset_code.to_uppercase();
        let mut hex = format!("0x{}", hex::encode(&asset_code));

        for _ in self.asset_code.len()..4 {
            hex = hex + "00";
        }

        hex
    }

    pub fn asset_type(&self) -> Result<Asset,Error> {
        let _asset_code = self.asset_code.to_uppercase();
        let _asset_code = _asset_code.as_bytes();

        Ok(
            if self.asset_code.len() <= 4 {
                let mut asset_code = [0; 4];
                asset_code[.._asset_code.len()].copy_from_slice(_asset_code);

                Asset::AssetTypeCreditAlphanum4(
                    AlphaNum4 {
                        asset_code,
                        issuer: self.asset_issuer_as_public_key()?
                    }
                )
            } else if  self.asset_code.len() <= 12 {
                let mut asset_code = [0; 12];
                asset_code[.._asset_code.len()].copy_from_slice(_asset_code);

                Asset::AssetTypeCreditAlphanum12(
                    AlphaNum12 {
                        asset_code,
                        issuer: self.asset_issuer_as_public_key()?,
                    }
                )
            } else {
                error!("‼️{:<6} - Asset Code {} exceed max characters of 12", "OUT OF RANGE", &self.asset_code);
                return Err(Error::EncodingFailed("asset_code".to_string()));
            }
        )
    }

    fn asset_issuer_as_public_key(&self) -> Result<PublicKey,Error> {
        PublicKey::from_encoding(&self.asset_issuer).map_err(|e|{
            error!("‼️{:<6} - Encoding asset issuer:{}: {e:?}", "FAILED", &self.asset_issuer);
            Error::EncodingFailed("asset issuer".to_string())
        })
    }
}
