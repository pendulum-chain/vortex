
mod error;
mod impls;
mod schema;
mod models;

use deadpool_diesel::postgres::Pool;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use tracing::{error, info, warn};
pub use error::Error;
pub use models::{Token,TokensFilter};
use impls::file::try_by_asset_code;
use impls::insert;

pub use impls::{get_all_tokens, get_token_by_asset_code};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

pub async fn run_migrations(pool:&Pool) -> Result<(),Error> {
    match pool.get().await {
        Err(e) => {
            error!("‼️{:<6} - retrieving object from pool: {e:?}", "FAILED");
            return Err(Error::MigrationFailed)
        }
        Ok(conn) => if let Err(e) = conn.interact(|conn| {
            conn.run_pending_migrations(MIGRATIONS).map(|_|())
        }).await {
            error!("‼️{:<6} - migration: {e:?}", "FAILED");
            return Err(Error::MigrationFailed)
        }
    }

    Ok(())
}


#[doc(hidden)]
/// Inserts BRL and EURC to db
pub async fn initialize_db(pool: &Pool) -> Result<(),Error> {
    let brl_token = try_by_asset_code("brL")?;
    match insert(pool,brl_token.clone()).await {
        Ok(id) => info!("💰️{:<6} - to db with id {id}: {brl_token:?} ", "INSERTED"),
        Err(e) => warn!("⚠️{:<6} - inserting {} to db: {e}", "WARNING", brl_token.asset_code)
    };

    let eurc_token = try_by_asset_code("eurc")?;
    match insert(pool, eurc_token.clone()).await {
        Ok(id) => info!("💰️{:<6} - to db with id {id}: {eurc_token:?} ", "INSERTED"),
        Err(e) => warn!("⚠️{:<6} - inserting {} to db: {e}", "WARNING", eurc_token.asset_code)
    };

    Ok(())
}
