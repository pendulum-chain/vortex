import { QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  // Optional: If you want to disable it on rollback
  // await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS "uuid-ossp";');
  // Usually, it's safe to leave the extension enabled even if rolling back later migrations.
  // If you uncomment the DROP EXTENSION, ensure no subsequent migrations depend on it during rollback.
  console.log("Migration 000-enable-uuid-ossp: Down migration does nothing (leaving uuid-ossp enabled).");
}
