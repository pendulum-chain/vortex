
mod error;

// ------ we will not import these files; these will serve as examples
// ------ on how to use diesel
// mod impls;
// mod schema;
// mod models;

use deadpool_diesel::postgres::Pool;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use tracing::error;
pub use error::Error;


pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

pub async fn run_migrations(connection_pool:&Pool) -> Result<(),Error> {
    match connection_pool.get().await {
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
