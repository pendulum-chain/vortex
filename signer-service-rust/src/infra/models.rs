use deadpool_diesel::postgres::Pool;
use diesel::{
    ExpressionMethods, Identifiable, PgTextExpressionMethods, QueryDsl, Queryable, RunQueryDsl,
    Selectable, SelectableHelper,
};
use crate::infra::error::adapt_infra_error;
use crate::infra::{Error, Token};
use crate::infra::schema::tokens;

#[derive(Identifiable, Queryable, Selectable)]
#[diesel(table_name = crate::infra::schema::tokens)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub(super) struct TokensDb {
    pub id: i32,
    pub asset_code: String,
    pub asset_issuer: String,
    pub vault_account_id: String,
    pub toml_url: String,
    pub min_withdrawal_amount: Option<String>
}

pub struct TokensFilter {
    pub asset_code: Option<String>,
    pub asset_issuer: Option<String>,
    pub vault_account_id: Option<String>,
}
impl TokensDb {
    pub fn into_token(self) -> Token {
        Token {
            asset_code: self.asset_code,
            asset_issuer: self.asset_issuer,
            vault_account_id: self.vault_account_id,
            toml_url: self.toml_url,
            min_withdrawal_amount: self.min_withdrawal_amount,
        }
    }
}

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

pub async fn get_all(pool: &Pool, filter:TokensFilter) -> Result<Vec<Token>,Error> {
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
