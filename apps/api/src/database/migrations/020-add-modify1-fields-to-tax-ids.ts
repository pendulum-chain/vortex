import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("tax_ids", "initial_quote_id", {
    allowNull: true,
    type: DataTypes.STRING
  });

  await queryInterface.addColumn("tax_ids", "final_quote_id", {
    allowNull: true,
    type: DataTypes.STRING
  });

  await queryInterface.addColumn("tax_ids", "final_timestamp", {
    allowNull: true,
    type: DataTypes.DATE
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("tax_ids", "initial_quote_id");
  await queryInterface.removeColumn("tax_ids", "final_quote_id");
  await queryInterface.removeColumn("tax_ids", "final_timestamp");
}
