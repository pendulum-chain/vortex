import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("quote_tickets", "api_credential_id", {
    allowNull: true,
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "api_credentials"
    },
    type: DataTypes.UUID
  });

  await queryInterface.addIndex("quote_tickets", ["api_credential_id"], {
    name: "idx_quote_tickets_api_credential_id"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("quote_tickets", "idx_quote_tickets_api_credential_id");
  await queryInterface.removeColumn("quote_tickets", "api_credential_id");
}
