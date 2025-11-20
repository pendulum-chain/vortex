import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Rename discount column to target_discount
  await queryInterface.renameColumn("partners", "discount", "target_discount");

  // Add max_subsidy column
  await queryInterface.addColumn("partners", "max_subsidy", {
    allowNull: false,
    defaultValue: 0,
    type: DataTypes.DECIMAL(10, 4)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove max_subsidy column
  await queryInterface.removeColumn("partners", "max_subsidy");

  // Rename target_discount back to discount
  await queryInterface.renameColumn("partners", "target_discount", "discount");
}
