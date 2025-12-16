import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Add min_target_discount column
  await queryInterface.addColumn("partners", "min_target_discount", {
    allowNull: false,
    defaultValue: 0,
    type: DataTypes.DECIMAL(10, 4)
  });

  // Add max_target_discount column
  await queryInterface.addColumn("partners", "max_target_discount", {
    allowNull: false,
    defaultValue: 0,
    type: DataTypes.DECIMAL(10, 4)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove max_target_discount column
  await queryInterface.removeColumn("partners", "max_target_discount");

  // Remove min_target_discount column
  await queryInterface.removeColumn("partners", "min_target_discount");
}
