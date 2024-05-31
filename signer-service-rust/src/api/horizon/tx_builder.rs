
use substrate_stellar_sdk::{Asset, Operation, PublicKey, Signer, SignerKey, StroopAmount, TimeBounds, Transaction, TransactionEnvelope};
use substrate_stellar_sdk::network::{Network, PUBLIC_NETWORK, TEST_NETWORK};
use substrate_stellar_sdk::types::{ChangeTrustAsset, Preconditions};
use tracing::error;
use wallet::operations::AppendExt;
use wallet::StellarWallet;
use crate::api::Error;
use crate::domain::models::{Token};
use crate::utils::public_key_as_string;

const BASE_FEE:u32 = 1000000;
const SET_OPT_LOW_THRESHOLD:u8 = 2;
const SET_OPT_MED_THRESHOLD:u8 = 2;
const SET_OPT_HIGH_THRESHOLD:u8 = 2;
const SET_OPT_SIGNER_WEIGHT:u32 = 1;

pub async fn create_account_transaction(wallet:&StellarWallet,
                       asset_code:&str,
                       destination_account:PublicKey,
                       stroop_amount: i64,
                       max_time: u64
) -> Result<Transaction,Error> {
    let create_op = Operation::new_create_account(
       destination_account,
       StroopAmount(stroop_amount)
   ).map_err(|e| {
        error!("‼️{:<3} - create account operation: {e:?}", "FAILED");
        Error::OperationError("create account".to_string())
    })?;

    // add threshold to the new account
    let set_opt_op = Operation::new_set_options(
        None,
        None,
        None,
        None,
        Some(SET_OPT_LOW_THRESHOLD),
        Some(SET_OPT_MED_THRESHOLD),
        Some(SET_OPT_HIGH_THRESHOLD),
        None,
        Some(Signer {
            key: SignerKey::SignerKeyTypeEd25519(wallet.secret_key().into_binary()),
            weight: SET_OPT_SIGNER_WEIGHT,
        })
    ).map_err(|e| {
        error!("‼️{:<3} - set options operation: {e:?}", "FAILED");
        Error::OperationError("set options".to_string())
    })?;

    // create a trust line
    let token = Token::try_by_asset_code(asset_code)?;
    let tk_asset = asset_to_change_trust_asset_type(&token)?;
    let change_trust_op = Operation::new_change_trust(
        tk_asset
    ).map_err(|e| {
        error!("‼️{:<3} - change trust asset operation: {e:?}", "FAILED");
        Error::OperationError("change trust asset".to_string())
    })?;

    // prepare the transaction:
    let mut tx = create_transaction_no_operations(wallet,max_time).await?;

    // insert all 3 operations
    tx.append_multiple(vec![create_op,set_opt_op,change_trust_op])
        .map_err(|e| {
            error!("‼️{:<3} - appending operations to transaction: {e:?}", "FAILED");
            Error::TransactionError("append multiple operations".to_string())
        })?;


    Ok(tx)
}

fn asset_to_change_trust_asset_type(token:&Token) -> Result<ChangeTrustAsset,Error> {
     token.get_asset_type().map(|asset| match asset {
         Asset::AssetTypeCreditAlphanum4(res) =>
         ChangeTrustAsset::AssetTypeCreditAlphanum4(res),
         Asset::AssetTypeCreditAlphanum12(res) =>
             ChangeTrustAsset::AssetTypeCreditAlphanum12(res),
         Asset::AssetTypeNative | Asset::Default(_) =>
             ChangeTrustAsset::AssetTypeNative
     }).map_err(|e| e.into())
}

/// Basic transaction without any operations yet
async fn create_transaction_no_operations(
    wallet: &StellarWallet,
    max_time: u64
) -> Result<Transaction,Error> {
    let next_sequence = wallet.get_sequence().await.
        map_err(|e| {
            let pub_key = public_key_as_string(&wallet.public_key());
            error!("‼️{:<3} - retrieving sequence number of Stellar Public Key: {pub_key}: {e:?}", "FAILED");
            Error::WalletError("sequence number".to_string())
        })? + 1;

    // prepare the transaction
    Transaction::new(
        wallet.public_key(),
        next_sequence,
        Some(BASE_FEE),
        Preconditions::PrecondTime(TimeBounds{ min_time: 0, max_time }),
        None // no memo
    ).map_err(|e| {
        error!("‼️{:<3} - creating transaction: {e:?}", "FAILED");
        Error::TransactionError("new".to_string())
    })
}


fn create_and_sign_envelope(
    wallet: &StellarWallet,
    tx: Transaction,
) -> Result<TransactionEnvelope, Error> {
    // convert to envelope
    let mut envelope = tx.into_transaction_envelope();
    sign_envelope(wallet, &mut envelope)?;

    Ok(envelope)
}

fn sign_envelope(wallet: &StellarWallet, envelope: &mut TransactionEnvelope) -> Result<(), Error> {
    let network: &Network =
        if wallet.is_public_network() { &PUBLIC_NETWORK } else { &TEST_NETWORK };

    envelope
        .sign(network, vec![&wallet.secret_key()])
        .map_err(|e| {
            error!("‼️{:<3} - signing envelope: {e:?}", "FAILED");
            Error::WalletError("signing envelope".to_string())
        })?;

    Ok(())
}