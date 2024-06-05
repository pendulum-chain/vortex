use substrate_stellar_sdk::{Asset, Memo, Operation, PublicKey, TimeBounds, Transaction};
use substrate_stellar_sdk::types::{ChangeTrustAsset, Preconditions};
use tracing::error;
use crate::api::Error;

const BASE_FEE:u32 = 1000000;

#[doc(hidden)]
/// A helper macro to convert [`substrate_stellar_sdk::StellarSdkError`] to [`Error::OperationError`]
macro_rules! operation_with_custom_err {
    ($op:expr, $op_str:expr) => {
        $op.map_err(|e| {
            let op_str = stringify!($op_str);
            error!("‼️{:<3} - {op_str} operation: {e:?}", "FAILED");
            Error::OperationError(op_str.to_string())
        })
    };
}

pub(super) use operation_with_custom_err;
use crate::infra::Token;

/// Returns a basic [`Transaction`] WITHOUT any operations yet
pub(super) fn create_transaction_no_operations(
    source_account: PublicKey,
    next_sequence: i64,
    max_time: u64,
    memo: Option<Memo>
) -> Result<Transaction,Error> {

    // prepare the transaction
    Transaction::new(
        source_account,
        next_sequence,
        Some(BASE_FEE),
        Preconditions::PrecondTime(TimeBounds{ min_time: 0, max_time }),
        memo
    ).map_err(|e| {
        error!("‼️{:<3} - creating transaction: {e:?}", "FAILED");
        Error::TransactionError("new".to_string())
    })
}

pub(super) fn change_trust_operation(token:&Token) -> Result<Operation,Error> {
    let tk_asset = asset_to_change_trust_asset_type(token)?;
    operation_with_custom_err!(Operation::new_change_trust(
        tk_asset),
        "change trust"
   )
}
pub(super) fn asset_to_change_trust_asset_type(token:&Token) -> Result<ChangeTrustAsset,Error> {
    token.asset_type().map(|asset| match asset {
        Asset::AssetTypeCreditAlphanum4(res) =>
            ChangeTrustAsset::AssetTypeCreditAlphanum4(res),
        Asset::AssetTypeCreditAlphanum12(res) =>
            ChangeTrustAsset::AssetTypeCreditAlphanum12(res),
        Asset::AssetTypeNative | Asset::Default(_) =>
            ChangeTrustAsset::AssetTypeNative
    }).map_err(|e| e.into())
}