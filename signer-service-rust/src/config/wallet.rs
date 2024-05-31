use std::env;
use std::fmt::{Debug, Formatter};
use substrate_stellar_sdk::{SecretKey, StellarTypeToString};
use tracing::{error, warn};
use wallet::StellarWallet;
use crate::config::Error;
use crate::utils::public_key_as_string;

const STELLAR_SECRET_KEY:&str = "STELLAR_SECRET_KEY";
const STELLAR_PUBLIC_NETWORK:&str = "STELLAR_PUBLIC_NETWORK";

pub struct WalletConfig {
    secret:SecretKey,
    is_public_network: bool
}

impl Debug for WalletConfig {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WalletConfig")
            .field("secret", &"******")
            .field("is_public_network", &self.is_public_network)
            .finish()
    }
}

impl WalletConfig {
    pub(super) fn try_from_env() -> Result<Self,Error> {
        let secret = env::var("STELLAR_SECRET_KEY").map_err(|_| Error::MissingStellarSecretKey)?;
        let secret = SecretKey::from_encoding(&secret)
            .map_err(|e| {
                error!("‼️Failed to parse stellar secret key  ******: {e:?}");
                Error::ParseFailed("stellar secret key".to_string())
            })?;

        let is_public_network = env::var("STELLAR_PUBLIC_NETWORK").map_err(|_| Error::MissingStellarNetworkIdentifier)?;
        let is_public_network = is_public_network.parse::<bool>()
            .map_err(|_| {
                error!("‼️Failed to parse stellar public network {is_public_network}");
                Error::ParseFailed("stellar public network".to_string())
            })?;

        Ok(WalletConfig {
            secret,
            is_public_network,
        })
    }

    pub fn public_key_as_str(&self) -> String {
        public_key_as_string(self.secret.get_public())
    }

    pub fn create_wallet(&self) -> Result<StellarWallet,Error> {
        StellarWallet::from_secret_key(self.secret.clone(), self.is_public_network)
            .map_err(|e| {
                error!("‼️{:<3} - Wallet creation for Stellar Public Key: {}", "FAILED", self.public_key_as_str());
                Error::CreateWalletFailed
            })
    }
}