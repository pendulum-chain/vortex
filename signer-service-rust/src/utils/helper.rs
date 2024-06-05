use substrate_stellar_sdk::PublicKey;

pub fn public_key_as_string(public_key:&PublicKey) -> String {
    String::from_utf8(public_key.to_encoding())
        .unwrap_or_else(|e| {
            tracing::warn!("⚠️{:<3} - Stellar Public Key conversion:{e:?}\n", "WARNING");
            "undefined".to_string()
        })
}