use diesel::{
    Identifiable, Insertable, Queryable,
    Selectable,
};
use serde::{Deserialize, Serialize};
use substrate_stellar_sdk::{Asset, PublicKey};
use substrate_stellar_sdk::types::{AlphaNum12, AlphaNum4};
use tracing::error;
use crate::infra::Error;

/// Representation of the `tokens` Table
#[derive(Identifiable, Queryable, Selectable)]
#[diesel(table_name = crate::infra::schema::tokens)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub(super) struct TokensDb {
    pub id: i32,
    pub asset_code: String,
    pub asset_issuer: String,
    pub vault_account_id: String,
    pub toml_url: String,
    pub min_withdrawal_amount: Option<String>
}

impl TokensDb {
    /// convert to [`Token`] structure
    pub fn into_token(self) -> Token {
        Token {
            asset_code: self.asset_code,
            asset_issuer: self.asset_issuer,
            vault_account_id: self.vault_account_id,
            toml_url: self.toml_url,
            min_withdrawal_amount: self.min_withdrawal_amount,
        }
    }
}

/// A row of the `tokens` table WITHOUT the `id` column.
#[derive(Insertable, PartialEq, Clone, Debug, Serialize,Deserialize)]
#[diesel(table_name = crate::infra::schema::tokens)]
pub struct Token {
    pub asset_code: String,
    pub asset_issuer: String,
    pub vault_account_id: String,
    pub toml_url: String,
    pub min_withdrawal_amount: Option<String>,
}

impl Token {
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
            } else {
                let mut asset_code = [0; 12];
                asset_code[.._asset_code.len()].copy_from_slice(_asset_code);

                Asset::AssetTypeCreditAlphanum12(
                    AlphaNum12 {
                        asset_code,
                        issuer: self.asset_issuer_as_public_key()?,
                    }
                )
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

/// The allowable columns for filtering the `tokens` Table
pub struct TokensFilter {
    pub asset_code: Option<String>,
    pub asset_issuer: Option<String>,
    pub vault_account_id: Option<String>,
}

#[cfg(test)]
mod test {
    use super::*;

    fn test_token() -> Token {
        Token {
            asset_code:  "tzs".to_string(),
            asset_issuer: "GAENCD6BPYV46VEXWI7KH6D6DW342DB3HIVDM4ES2EDJGLX5MPFB74TG".to_string(),
            vault_account_id: "6g7fKQQZ9VfbBTQSaKBcATV4psApFra5EDwKLARFZCCVnSWS".to_string(),
            toml_url: "sample toml".to_string(),
            min_withdrawal_amount: None,
        }
    }

    mod token {
        use substrate_stellar_sdk::PublicKey::PublicKeyTypeEd25519;
        use super::*;

        #[test]
        fn test_asset_code_hex() {
            let mut token = test_token();
            assert_eq!(
                token.asset_code_hex(),
                "0x545a5300".to_string()
            );

            token.asset_code = "brl".to_string();
            assert_eq!(
                token.asset_code_hex(),
                "0x42524c00".to_string()
            );
        }

        #[test]
        fn test_asset_type() {
            let mut token = test_token();

            let expected_asset = Asset::AssetTypeCreditAlphanum4(
                AlphaNum4 {
                    asset_code: [84, 90, 83, 0],
                    issuer: PublicKeyTypeEd25519(
                        [8, 209, 15, 193, 126, 43, 207, 84, 151, 178, 62,
                            163, 248, 126, 29, 183, 205, 12, 59, 58, 42, 54,
                            112, 146, 209, 6, 147, 46, 253, 99, 202, 31
                        ])
                }
            );

            let actual_asset = token.asset_type().expect("should return an asset");
            assert_eq!(
                actual_asset,
                expected_asset
            );

            // fail with "range end index 13 out of range for slice of length 12"
            token.asset_code = "1234567890123".to_string();
            assert!(token.asset_type().is_err()); // should fail
        }

        #[test]
        fn test_asset_issuer_as_public_key() {

        }

    }

}