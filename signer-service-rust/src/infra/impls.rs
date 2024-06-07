use deadpool_diesel::postgres::Pool;
use diesel::{
    ExpressionMethods, PgTextExpressionMethods, QueryDsl, RunQueryDsl,
    SelectableHelper,
};

use crate::infra::{Error, Token};
use crate::infra::error::adapt_infra_error;
use crate::infra::models::{TokensDb, TokensFilter};
use crate::infra::schema::tokens;

/// insert row to `tokens` table
pub async fn insert(pool: &Pool, token:Token) -> Result<i32,Error> {
    let conn = pool.get().await
        .map_err(adapt_infra_error)?;

    let res = conn.interact(|conn| {
        diesel::insert_into(tokens::table)
            .values(token)
            .returning(TokensDb::as_returning())
            .get_result(conn)
    })
        .await
        .map_err(adapt_infra_error)?
        .map_err(adapt_infra_error)?;

    Ok(res.id)
}

/// get all tokens based on the filter
pub async fn get_all_tokens(pool: &Pool, filter:TokensFilter) -> Result<Vec<Token>,Error> {
    let conn = pool.get().await.map_err(adapt_infra_error)?;
    let res = conn
        .interact(move |conn| {
            let mut query = tokens::table.into_boxed::<diesel::pg::Pg>();

            if let Some(asset_code) = filter.asset_code {
                let asset_code = asset_code.to_uppercase();
                query = query.filter(tokens::asset_code.ilike(format!("{}%", asset_code)));
            }

            if let Some(asset_issuer) = filter.asset_issuer {
                query = query.filter(tokens::asset_issuer.eq(asset_issuer));
            }

            if let Some(vault_account_id) = filter.vault_account_id {
                query = query.filter(tokens::vault_account_id.eq(vault_account_id));
            }

            query.select(TokensDb::as_select()).load::<TokensDb>(conn)
        })
        .await
        .map_err(adapt_infra_error)?
        .map_err(adapt_infra_error)?;

    Ok(res
        .into_iter()
        .map(|tokens_db| tokens_db.into_token())
        .collect()
    )
}

pub async fn get_token_by_asset_code(pool: &Pool, asset_code:&str) -> Result<Vec<Token>,Error> {
    let filter = TokensFilter {
        asset_code: Some(asset_code.to_string()),
        asset_issuer: None,
        vault_account_id: None,
    };

    get_all_tokens(pool,filter).await
}

// todo: use db instead of file
pub mod file {
    use tracing::error;
    use crate::infra::{Error, Token};

    #[doc(hidden)]
    /// Returns a Token by reading from a json file
    pub fn try_from_path(path: &str) -> Result<Token,Error> {
        let read_file = std::fs::read_to_string(path)
            .map_err(|_| {
                error!("‼️{:<6} - Reading file {path}", "FAILED");
                Error::DoesNotExist(path.to_string())
            })?;

        serde_json::from_str(&read_file)
            .map_err(|e| {
                error!("‼️{:<6} - Deserializing to Token struct in file {path}: {e:?}", "FAILED");
                Error::SerdeError(format!("Token struct in file {path}"))
            })
    }

    /// Returns a Token based on a supported asset_code
    pub fn try_by_asset_code(asset_code:&str) -> Result<Token,Error> {
        let asset_code = asset_code.to_uppercase();
        let path = format!("./resources/tokens/{asset_code}.json");

        try_from_path(&path).map_err(|e| {
            match e {
                Error::DoesNotExist(_) => {
                    Error::DoesNotExist(asset_code)
                }
                _ => e
            }
        })
    }

}