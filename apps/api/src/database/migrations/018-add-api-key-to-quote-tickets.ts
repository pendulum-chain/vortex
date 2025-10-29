import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Add api_key column to quote_tickets table
  await queryInterface.addColumn("quote_tickets", "api_key", {
    allowNull: true,
    comment: "Public API key used to create this quote (for tracking)",
    field: "api_key",
    type: DataTypes.STRING(255)
  });

  // Add index for api_key lookups
  await queryInterface.addIndex("quote_tickets", ["api_key"], {
    name: "idx_quote_tickets_api_key"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove index
  await queryInterface.removeIndex("quote_tickets", "idx_quote_tickets_api_key");

  // Remove column
  await queryInterface.removeColumn("quote_tickets", "api_key");
}
