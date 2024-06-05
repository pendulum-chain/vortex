use axum::Json;
use serde_json::{json, Value};
use substrate_stellar_sdk::{Operation, PublicKey, Transaction};
use tracing::error;
use wallet::operations::AppendExt;
use crate::api::{Error, Sep24Result};
use crate::api::horizon::helper::{change_trust_operation, create_transaction_no_operations};
use crate::config::AccountConfig;
use crate::infra::Token;


/// Returns a [`Json`] of the `funding_account`'s signatures for signing 2 transactions:
///   * payment transaction
///   * account merge transaction
///       * merging the `ephemeral_account_id` to the `funding_account`
pub fn build_payment_and_merge_tx(
    funding_account: &AccountConfig,
    ephemeral_account_id: PublicKey,
    ephemeral_sequence: i64,
    payment_data: Sep24Result,
    max_time:u64,
    asset_code: &str
) -> Result<Json<Value>,Error>{
    let token = Token::try_by_asset_code(asset_code)?;

    let payment_tx = payment_transaction(
        ephemeral_account_id.clone(),
        ephemeral_sequence,
        &token,
        max_time,
        payment_data
    )?;

    let merge_tx = merge_transaction(
        ephemeral_account_id,
        ephemeral_sequence,
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

    payment_tx.append_operation(
        Operation::new_payment(
            payment_data.offramping_account_id()?,
            token.asset_type()?,
            payment_data.amount()
        ).map_err(|e| {
            error!("‼️{:<3} - payment operation: {e:?}", "FAILED");
            Error::OperationError("payment operation".to_string())
        })?
    ).map_err(|e| {
        error!("‼️{:<3} - appending operation to transaction: {e:?}", "FAILED");
        Error::TransactionError("append operation".to_string())
    })?;

    Ok(payment_tx)
}

fn merge_transaction(
    source_account_id: PublicKey,
    next_sequence: i64,
    token:&Token,
    max_time: u64,
    destination_account_id: PublicKey,
) -> Result<Transaction,Error> {
    // create a trust line
    let change_trust_op = change_trust_operation(&token)?;

    // account merge op
    let merge_op = Operation::new_account_merge(
        destination_account_id
    ).map_err(|e| {
        error!("‼️{:<3} - account merge operation: {e:?}", "FAILED");
        Error::OperationError("account merge operation".to_string())
    })?;

    let mut merge_tx = create_transaction_no_operations(
        source_account_id,
        next_sequence,
        max_time,
        None
    )?;

    merge_tx.append_multiple(vec![change_trust_op,merge_op])
        .map_err(|e| {
            error!("‼️{:<3} - appending operations to transaction: {e:?}", "FAILED");
            Error::TransactionError("append multiple operations".to_string())
        })?;

    Ok(merge_tx)
}