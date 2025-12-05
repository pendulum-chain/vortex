import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Make user_id nullable in quote_tickets since quotes can be created before authentication
  // Using raw SQL because Sequelize's changeColumn doesn't reliably change nullability
  await queryInterface.sequelize.query(`
    ALTER TABLE quote_tickets ALTER COLUMN user_id DROP NOT NULL;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Revert to non-nullable (this will fail if there are null values)
  await queryInterface.sequelize.query(`
    ALTER TABLE quote_tickets ALTER COLUMN user_id SET NOT NULL;
  `);
}
