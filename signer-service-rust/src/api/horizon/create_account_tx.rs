use axum::Json;
use deadpool_diesel::postgres::Pool;
use serde_json::{json, Value};
use substrate_stellar_sdk::{Operation, PublicKey, Signer, SignerKey};
use tracing::error;
use wallet::operations::AppendExt;
use crate::api::Error;
use crate::api::horizon::helper::{asset_to_change_trust_asset_type, create_transaction_no_operations, get_single_token, operation_with_custom_err};
use crate::config::AccountConfig;

const SET_OPT_LOW_THRESHOLD:u8 = 2;
const SET_OPT_MED_THRESHOLD:u8 = 2;
const SET_OPT_HIGH_THRESHOLD:u8 = 2;
const SET_OPT_SIGNER_WEIGHT:u32 = 1;

const NEW_ACCOUNT_STARTING_BALANCE:&'static str = "2.5";

/// Returns a [`Json`] of:
///    * the `funding_account`'s signature (for signing this transaction)
///    * the  sequence number (when submitting this transaction) in [`String`] format
///    * the `funding_account`'s [`PublicKey`] in [`String`] format
///
/// The transaction created will perform 3 operations:
///    * [Create an account](Operation::new_create_account) for `ephemeral_account_id` in Stellar
///    * [Add threshold](Operation::new_set_options) to that new account
///    * [Add a trust line](Operation::new_change_trust) from the given `asset_code`. If the asset code does not exist in the db,
///      it will return [`NotFound`](crate::infra::Error::NotFound)
pub async fn build_create_account_tx(
    pool: &Pool,
    funding_account: &AccountConfig,
    ephemeral_account_id: &PublicKey,
    asset_code:&str,
    max_time: u64
) -> Result<Json<Value>,Error> {
    let sequence = funding_account.get_sequence().await?;

    // prepare the transaction:
    let mut tx = create_transaction_no_operations(
        funding_account.public_key(),
        // increment the sequence number
        sequence + 1,
        max_time,
        None
    )?;

    let operations = prepare_all_operations(
        funding_account,
        ephemeral_account_id.clone(),
        asset_code,
        pool
    ).await?;

    // insert all 3 operations
    tx.append_multiple(operations)
        .map_err(|e| {
            error!("‼️{:<6} - appending operations to transaction: {e:?}", "FAILED");
            Error::TransactionError("append multiple operations".to_string())
        })?;

    let tx_sig = funding_account.create_base64_signature(tx.clone())?;

    let public_key = funding_account.public_key_as_str();
    Ok(Json(json!({
        "signature": [tx_sig],
        "sequence": sequence,
        "public": public_key
    })))
}

#[doc(hidden)]
/// Returns relevant operations for creating an account in Stellar
async fn prepare_all_operations(
    funding_account: &AccountConfig,
    ephemeral_account_id: PublicKey,
    asset_code:&str,
    pool: &Pool
) -> Result<Vec<Operation>,Error> {
    // create account op
    let create_op = operation_with_custom_err!(
        Operation::new_create_account(
            ephemeral_account_id.clone(),
            NEW_ACCOUNT_STARTING_BALANCE
        ),
        "create account"
    )?;

    // add threshold to the new account
    let mut set_opt_op = operation_with_custom_err!(Operation::new_set_options::<PublicKey,&str>(
        None,
        None,
        None,
        None,
        Some(SET_OPT_LOW_THRESHOLD),
        Some(SET_OPT_MED_THRESHOLD),
        Some(SET_OPT_HIGH_THRESHOLD),
        None,
        Some(Signer {
            key: SignerKey::SignerKeyTypeEd25519(funding_account.public_key().into_binary()),
            weight: SET_OPT_SIGNER_WEIGHT,
        })),
        "set options"
    )?;
    set_opt_op.source_account = Some(ephemeral_account_id.clone().into());

    // add trust line
    let mut change_trust_op = change_trust_op(pool,asset_code).await?;
    change_trust_op.source_account = Some(ephemeral_account_id.into());

    Ok(vec![create_op,set_opt_op, change_trust_op])
}

#[doc(hidden)]
async fn change_trust_op(pool:&Pool, asset_code:&str) -> Result<Operation,Error> {
    let token = get_single_token(pool,asset_code).await?;
    let tk_asset = asset_to_change_trust_asset_type(&token)?;

    operation_with_custom_err!(
        Operation::new_change_trust(tk_asset),
        "change trust"
    )
}

