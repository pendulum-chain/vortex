use axum::Json;
use deadpool_diesel::postgres::Pool;
use serde_json::{json, Value};
use substrate_stellar_sdk::{Operation, PublicKey, Transaction};
use tracing::error;
use wallet::operations::AppendExt;
use crate::api::{Error, Sep24Result};
use crate::api::horizon::helper::{asset_to_change_trust_asset_type, create_transaction_no_operations, get_single_token, operation_with_custom_err};
use crate::config::AccountConfig;
use crate::infra::Token;

const CHANGE_TRUST_LIMIT:&'static str = "0";

/// Returns a [`Json`] of:
///    * the `funding_account`'s signatures (for signing this transaction)
///    * the `funding_account`'s [`PublicKey`] in [`String`] format
///
/// The `funding_account`'s signatures comes from signing 2 transactions:
///    * [payment](Operation::new_payment) transaction
///    * account merge transaction
///       * [Add a trust line](Operation::new_change_trust_with_limit) from the given `asset_code`. If the asset code does not exist in the db,
///          it will return [`NotFound`](crate::infra::Error::NotFound)
///       * [Merging](Operation::new_account_merge) the `ephemeral_account_id` to the `funding_account`
pub async fn build_payment_and_merge_tx(
    pool: &Pool,
    funding_account: &AccountConfig,
    ephemeral_account_id: PublicKey,
    ephemeral_sequence: i64,
    asset_code: &str,
    max_time:u64,
    payment_data: Sep24Result,
) -> Result<Json<Value>,Error>{
    // retrieve the token
    let token = get_single_token(pool, asset_code).await?;

    let payment_tx = payment_transaction(
        ephemeral_account_id.clone(),
        // increment the sequence
        ephemeral_sequence + 1,
        &token,
        max_time,
        payment_data
    )?;

    let merge_tx = merge_transaction(
        ephemeral_account_id,
        // increment the sequence again
        ephemeral_sequence + 2,
        &token,
        max_time,
        funding_account.public_key()
    )?;

    let payment_tx_sig = funding_account.create_base64_signature(payment_tx)?;

    let merge_tx_sig = funding_account.create_base64_signature(merge_tx)?;


    let public_key = funding_account.public_key_as_str();
    Ok(Json(json!({
        "signature": [
            payment_tx_sig,
            merge_tx_sig
        ],
        "public": public_key
    })))
}

#[doc(hidden)]
fn payment_transaction(
    source_account_id: PublicKey,
    next_sequence: i64,
    token:&Token,
    max_time: u64,
    payment_data: Sep24Result
) -> Result<Transaction,Error> {
    let mut payment_tx = create_transaction_no_operations(
        source_account_id,
        next_sequence,
        max_time,
        Some(payment_data.memo()?)
    )?;

    let payment_op = operation_with_custom_err!(
        Operation::new_payment(
            payment_data.offramping_account_id()?,
            token.asset_type()?,
            payment_data.amount
        ),
        "payment"
        )?;

    payment_tx.append_operation(payment_op).map_err(|e| {
        error!("‼️{:<6} - appending operation to transaction: {e:?}", "FAILED");
        Error::TransactionError("append operation".to_string())
    })?;

    Ok(payment_tx)
}

#[doc(hidden)]
fn merge_transaction(
    source_account_id: PublicKey,
    next_sequence: i64,
    token:&Token,
    max_time: u64,
    destination_account_id: PublicKey,
) -> Result<Transaction,Error> {
    // create a trust line
    let tk_asset = asset_to_change_trust_asset_type(token)?;
    let change_trust_op = operation_with_custom_err!(
        Operation::new_change_trust_with_limit(tk_asset,CHANGE_TRUST_LIMIT),
        "change trust"
   )?;

    // account merge op
    let merge_op = operation_with_custom_err!(
        Operation::new_account_merge(destination_account_id),
        "account merge"
    )?;

    let mut merge_tx = create_transaction_no_operations(
        source_account_id,
        next_sequence,
        max_time,
        None
    )?;

    merge_tx.append_multiple(vec![change_trust_op,merge_op])
        .map_err(|e| {
            error!("‼️{:<6} - appending operations to transaction: {e:?}", "FAILED");
            Error::TransactionError("append multiple operations".to_string())
        })?;

    Ok(merge_tx)
}