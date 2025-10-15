import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("ramp_states", "payment_method", {
    allowNull: false,
    type: DataTypes.STRING(20)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("ramp_states", "payment_method");
}
