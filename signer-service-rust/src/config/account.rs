use std::env;
use std::fmt::{Debug, Formatter};
use substrate_stellar_sdk::{PublicKey, SecretKey, Transaction};
use substrate_stellar_sdk::network::{Network, PUBLIC_NETWORK, TEST_NETWORK};
use tracing::error;
use wallet::{HorizonBalance, StellarWallet};
use crate::config::Error;
use crate::helper::public_key_as_string;

#[doc(hidden)]
/// the environment variable name to store the secret key
const STELLAR_SECRET_KEY:&str = "STELLAR_SECRET_KEY";

#[doc(hidden)]
/// the environment variable name to store whether to use Public network or Test network
const STELLAR_PUBLIC_NETWORK:&str = "STELLAR_PUBLIC_NETWORK";

/// The configuration of the funding account
#[derive(Clone)]
pub struct AccountConfig {
    secret:SecretKey,
    is_public_network: bool
}

impl Debug for AccountConfig {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AccountConfig")
            .field("secret", &"******")
            .field("is_public_network", &self.is_public_network)
            .finish()
    }
}

impl AccountConfig {
    /// Create new config via environment variables
    pub(super) fn try_from_env() -> Result<Self,Error> {
        let secret = env::var(STELLAR_SECRET_KEY).map_err(|_| Error::MissingStellarSecretKey)?;
        let secret = SecretKey::from_encoding(&secret)
            .map_err(|e| {
                error!("‼️Failed to parse stellar secret key  ******: {e:?}");
                Error::ParseFailed("stellar secret key".to_string())
            })?;

        let is_public_network = env::var(STELLAR_PUBLIC_NETWORK).map_err(|_| Error::MissingStellarNetworkIdentifier)?;
        let is_public_network = is_public_network.parse::<bool>()
            .map_err(|_| {
                error!("‼️Failed to parse stellar public network {is_public_network}");
                Error::ParseFailed("stellar public network".to_string())
            })?;

        Ok(AccountConfig {
            secret,
            is_public_network,
        })
    }

    /// returns the [`PublicKey`] of the funding account in [`String`] format
    pub fn public_key_as_str(&self) -> String {
        public_key_as_string(self.secret.get_public())
    }

    /// returns the [`PublicKey`] of the funding account
    pub fn public_key(&self) -> PublicKey {
        self.secret.get_public().clone()
    }

    /// returns the Stellar network to use
    pub fn network(&self) -> &Network {
        if self.is_public_network {
            &PUBLIC_NETWORK
        } else {
            &TEST_NETWORK
        }
    }

    /// Returns a signature to be added in this `tx` transaction
    pub fn create_base64_signature(
        &self,
        tx:Transaction
    ) -> Result<String,Error> {
        let x = tx.into_transaction_envelope();
        let res = x.create_base64_signature(
            self.network(),
            &self.secret
        );

        String::from_utf8(res.clone())
            .map_err(|e| {
                error!("⚠️{:<6} - converting Vec<u8> to base64 signature: {e:?}\n", "FAILED");
                Error::ParseFailed("base64 signature".to_string())
            })
    }

    /// Returns the current sequence of this account
    pub async fn get_sequence(&self) -> Result<i64,Error> {
        let wallet = self.create_wallet()?;

        wallet.get_sequence().await.map_err(|e|{
            let pub_key = self.public_key_as_str();
            error!("⚠️{:<6} - retrieving current sequence of {pub_key}: {e:?}\n", "FAILED");
            Error::CreateWalletFailed
        })
    }

    /// Returns a list of [`HorizonBalance`]s of this account
    pub async fn get_balances(&self) -> Result<Vec<HorizonBalance>, Error> {
        let wallet = self.create_wallet()?;

        wallet.get_balances().await.map_err(|e|{
            let pub_key = self.public_key_as_str();
            error!("⚠️{:<6} - retrieving balances of {pub_key}: {e:?}\n", "FAILED");
            Error::CreateWalletFailed
        })
    }

    #[doc(hidden)]
    fn create_wallet(&self) -> Result<StellarWallet,Error> {
        StellarWallet::from_secret_key(self.secret.clone(),self.is_public_network)
            .map_err(|e|{
                let pub_key = self.public_key_as_str();
                error!("⚠️{:<6} - creating wallet of {pub_key}: {e:?}\n", "FAILED");
                Error::CreateWalletFailed
            })
    }

}