use substrate_stellar_sdk::PublicKey;
use tracing::warn;

pub fn public_key_as_string(public_key:&PublicKey) -> String {
    String::from_utf8(public_key.to_encoding())
        .unwrap_or_else(|e| {
            warn!("⚠️{:<3} - Stellar Public Key conversion:{e:?}\n", "WARNING");
            "undefined".to_string()
        })
}