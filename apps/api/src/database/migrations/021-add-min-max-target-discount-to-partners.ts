import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Add min_dynamic_difference column
  await queryInterface.addColumn("partners", "min_dynamic_difference", {
    allowNull: false,
    defaultValue: 0,
    type: DataTypes.DECIMAL(10, 4)
  });

  // Add max_dynamic_difference column
  await queryInterface.addColumn("partners", "max_dynamic_difference", {
    allowNull: false,
    defaultValue: 0,
    type: DataTypes.DECIMAL(10, 4)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove max_dynamic_difference column
  await queryInterface.removeColumn("partners", "max_dynamic_difference");

  // Remove min_dynamic_difference column
  await queryInterface.removeColumn("partners", "min_dynamic_difference");
}
