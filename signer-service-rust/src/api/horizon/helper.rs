use deadpool_diesel::postgres::Pool;
use substrate_stellar_sdk::{Asset, Memo, PublicKey, TimeBounds, Transaction};
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
            error!("‼️{:<6} - {op_str} operation: {e:?}", "FAILED");
            Error::OperationError(op_str.to_string())
        })
    };
}

pub(super) use operation_with_custom_err;
use crate::infra::{get_all_tokens, Token, TokensFilter};

pub(super) async fn get_single_token(pool:&Pool, asset_code: &str) -> Result<Token,Error> {
    let mut tokens = get_all_tokens(pool,TokensFilter{
        asset_code: Some(asset_code.to_string()),
        asset_issuer: None,
        vault_account_id: None,
    }).await?;

    tokens.pop().ok_or(Error::InfraError(crate::infra::Error::DoesNotExist(asset_code.to_string())))
}


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
        error!("‼️{:<6} - creating transaction: {e:?}", "FAILED");
        Error::TransactionError("new".to_string())
    })
}

#[doc(hidden)]
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


#[cfg(test)]
mod test {
    use substrate_stellar_sdk::Asset;
    use crate::api::horizon::helper::asset_to_change_trust_asset_type;
    use crate::infra::Token;

    // #[test]
    // fn test_asset_to_change_trust_asset_type() {
    //     let token = Token {
    //         asset_code: "XXXXXX".to_string(),
    //         asset_issuer: "GAENCD6BPYV46VEXWI7KH6D6DW342DB3HIVDM4ES2EDJGLX5MPFB74TG".to_string(),
    //         vault_account_id: "6g7fKQQZ9VfbBTQSaKBcATV4psApFra5EDwKLARFZCCVnSWS".to_string(),
    //         toml_url: "sample toml".to_string(),
    //         min_withdrawal_amount: None,
    //     };
    //
    //     assert_eq!(
    //         asset_to_change_trust_asset_type(&token),
    //         Ok(Asset::AssetTypeCreditAlphanum12(token.as))
    //
    //     )
    //
    //     asset_to_change_trust_asset_type(&token)
    // }
    
}