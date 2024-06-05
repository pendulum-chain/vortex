use axum::Json;
use serde_json::{json, Value};
use substrate_stellar_sdk::{Operation, PublicKey, Signer, SignerKey, StroopAmount};
use tracing::error;
use wallet::operations::AppendExt;
use crate::api::Error;
use crate::api::horizon::helper::{change_trust_operation, create_transaction_no_operations, operation_with_custom_err};
use crate::config::AccountConfig;
use crate::infra::Token;

const SET_OPT_LOW_THRESHOLD:u8 = 2;
const SET_OPT_MED_THRESHOLD:u8 = 2;
const SET_OPT_HIGH_THRESHOLD:u8 = 2;
const SET_OPT_SIGNER_WEIGHT:u32 = 1;

const NEW_ACCOUNT_STARTING_BALANCE:StroopAmount = StroopAmount(2500000);

/// Returns a [`Json`] of the `funding_account`'s signature (for signing this transaction)
/// and sequence number (when submitting this transaction)
///
/// This transaction will perform 3 operations:
///  * Create an account, for `ephemeral_account_id`
///  * Add threshold to that account
///  * Add a trust line wth the given `asset_code`
pub async fn build_create_account_tx(
    funding_account: &AccountConfig,
    ephemeral_account_id: &PublicKey,
    asset_code:&str,
    max_time: u64,
) -> Result<Json<Value>,Error> {
    let sequence = funding_account.get_sequence().await?;

    // prepare the transaction:
    let mut tx = create_transaction_no_operations(
        funding_account.public_key(),
        sequence,
        max_time,
        None
    )?;

    let operations = prepare_all_operations(
        funding_account,
        ephemeral_account_id.clone(),
        asset_code
    )?;

    // insert all 3 operations
    tx.append_multiple(operations)
        .map_err(|e| {
            error!("‼️{:<3} - appending operations to transaction: {e:?}", "FAILED");
            Error::TransactionError("append multiple operations".to_string())
        })?;

    let tx_sig = funding_account.create_base64_signature(tx)?;

    let public_key = funding_account.public_key_as_str();
    Ok(Json(json!({
        "signature": [tx_sig],
        "sequence": sequence,
        "public": public_key
    })))
}

fn prepare_all_operations(
    funding_account: &AccountConfig,
    ephemeral_account_id: PublicKey,
    asset_code:&str
) -> Result<Vec<Operation>,Error> {
    let create_op = operation_with_custom_err!(
        Operation::new_create_account(
            ephemeral_account_id,
            NEW_ACCOUNT_STARTING_BALANCE
        ),
        "create account"
    )?;

    // add threshold to the new account
    let set_opt_op = operation_with_custom_err!(Operation::new_set_options::<PublicKey,&str>(
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

    // create a trust line
    let token = Token::try_by_asset_code(asset_code)?;
    let change_trust_op = change_trust_operation(&token)?;

    Ok(vec![create_op,set_opt_op, change_trust_op])
}