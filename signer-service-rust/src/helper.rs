use std::str::FromStr;
use serde::{Deserialize, Deserializer};
use substrate_stellar_sdk::PublicKey;

pub fn public_key_as_string(public_key:&PublicKey) -> String {
    String::from_utf8(public_key.to_encoding())
        .unwrap_or_else(|e| {
            tracing::warn!("⚠️{:<3} - Stellar Public Key conversion:{e:?}\n", "WARNING");
            "undefined".to_string()
        })
}

pub fn de_str_to_i64<'de, D>(de: D) -> Result<i64, D::Error>
    where
        D: Deserializer<'de>,
{
    let s: &str = Deserialize::deserialize(de)?;

    i64::from_str(s).map_err(serde::de::Error::custom)
}