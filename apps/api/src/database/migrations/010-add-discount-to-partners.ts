import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Add discount column to partners table
  await queryInterface.addColumn("partners", "discount", {
    allowNull: false,
    comment: "Relative discount applied to the partner's quote, denoted as decimal value.",
    defaultValue: 0,
    type: DataTypes.DECIMAL(10, 4)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove the discount column
  await queryInterface.removeColumn("partners", "discount");
}
