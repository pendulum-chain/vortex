use deadpool_diesel::postgres::Pool;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use crate::config::DatabaseConfig;
use crate::infra::Error;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

pub async fn init_db(cfg: DatabaseConfig) {
    // Create a connection pool to the PostgreSQL database
    let manager = cfg.create_connection_pool();

    let pool = Pool::builder(manager).build()
        .map_err(|e| {
            tracing::error!("Failed to create connection pool: {e:?}");
            Error::InternalServerError
        })?;

}

async fn run_migrations(pool: &Pool) -> Result<(),Error> {
    let conn = pool.get().await
        .map_err(|e| {
            tracing::error!("Failed to retrieve object from connection pool: {e:?}");
            Error::PoolError
        })?;

    conn.interact(|conn| conn.run_pending_migrations())

    Ok(())
}