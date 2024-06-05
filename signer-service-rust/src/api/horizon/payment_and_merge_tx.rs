use axum::Json;
use serde_json::{json, Value};
use substrate_stellar_sdk::{Operation, PublicKey, Transaction};
use tracing::{error, info};
use wallet::operations::AppendExt;
use crate::api::Error;
use crate::api::horizon::helper::{change_trust_operation, create_transaction_no_operations};
use crate::domain::models::{Sep24Result, Token};
use crate::config::AccountConfig;

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

    info!("  payment_tx: {payment_tx:?}");

    let merge_tx = merge_transaction(
        ephemeral_account_id,
        ephemeral_sequence,
        &token,
        max_time,
        funding_account.public_key()
    )?;

    info!("  merge_tx: {merge_tx:?}");
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
            payment_data.offramping_account()?,
            token.get_asset_type()?,
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
    info!("   merge_transaction: start creating merge tx");
    // create a trust line
    let change_trust_op = change_trust_operation(&token)?;
    info!("   merge_transaction: op {change_trust_op:?}");

    // account merge op
    let merge_op = Operation::new_account_merge(
        destination_account_id
    ).map_err(|e| {
        error!("‼️{:<3} - account merge operation: {e:?}", "FAILED");
        Error::OperationError("account merge operation".to_string())
    })?;

    info!("   merge_transaction: op {merge_op:?}");

    let mut merge_tx = create_transaction_no_operations(
        source_account_id,
        next_sequence,
        max_time,
        None
    )?;


    info!("   merge_transaction: tx {merge_tx:?}");

    merge_tx.append_multiple(vec![change_trust_op,merge_op])
        .map_err(|e| {
            error!("‼️{:<3} - appending operations to transaction: {e:?}", "FAILED");
            Error::TransactionError("append multiple operations".to_string())
        })?;

    info!("   merge_transaction: tx append done");

    Ok(merge_tx)
}

#[cfg(test)]
mod test {
    use substrate_stellar_sdk::{SecretKey,TransactionEnvelope, XdrCodec};
    use substrate_stellar_sdk::network::{PUBLIC_NETWORK, TEST_NETWORK};


    #[tokio::test(flavor = "multi_thread")]
    async fn create_payment_test() {
        let mut transaction = TransactionEnvelope::from_base64_xdr("AAAAAgAAAAAI0Q/BfivPVJeyPqP4fh23zQw7Oio2cJLRBpMu/WPKHwAPQkAAEI5tAAAAWQAAAAEAAAAAAAAAAAAAAAAAAAACAAAAAQAAAAdub3RoaW5nAAAAAAEAAAAAAAAAAQAAAADbXK4cnapJLq2NmMPtXroXHKJHwxyGGdLEGxO+7wLv/QAAAAFFVVJDAAAAACES7oY4Z+TiGf4lTAkYsAvJ6kAHdb/Dq0QwlxzlBYd8AAAJGE5yoAAAAAAAAAAAAA==")
            .unwrap();

        let secret = "SCVJD7BHU5LNFXNIDC7E226HISKUOZUEPJWLA2YU2GNBFMP5PYF2TQBH";
        let secret_key = SecretKey::from_encoding(secret).unwrap();
        let public_key = secret_key.get_public().clone();
        let public_key = String::from_utf8(public_key.to_encoding()).unwrap();
        println!("public key: {public_key}");


        transaction.sign(&TEST_NETWORK,vec![&secret_key])
            .unwrap();
        let res = transaction.to_base64_xdr();
        let res = transaction.create_base64_signature(&PUBLIC_NETWORK,&secret_key);
        let res = String::from_utf8(res).unwrap();
        println!("the tx: {res}");

        assert!(true);
    }
}