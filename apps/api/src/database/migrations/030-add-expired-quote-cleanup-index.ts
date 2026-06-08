import { QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quote_tickets_expired_expires_at
    ON quote_tickets (expires_at)
    WHERE status = 'expired';
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    DROP INDEX CONCURRENTLY IF EXISTS idx_quote_tickets_expired_expires_at;
  `);
}
