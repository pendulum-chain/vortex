
mod error;
mod token;
mod schema;
mod models;


use deadpool_diesel::postgres::Pool;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
pub use error::Error;
pub use token::Token;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

pub async fn run_migrations(pool:&Pool) {
    let conn = pool.get().await.unwrap();
    conn.interact(|conn| conn.run_pending_migrations(MIGRATIONS).map(|_| ()))
        .await
        .unwrap();

}