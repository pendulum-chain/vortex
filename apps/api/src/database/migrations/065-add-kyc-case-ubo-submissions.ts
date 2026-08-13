import { DataTypes, type QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("kyc_cases", "ubo_submissions", {
    allowNull: false,
    defaultValue: {},
    type: DataTypes.JSONB
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("kyc_cases", "ubo_submissions");
}
