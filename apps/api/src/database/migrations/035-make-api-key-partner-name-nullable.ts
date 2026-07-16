import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.changeColumn("api_keys", "partner_name", {
    allowNull: true,
    field: "partner_name",
    type: DataTypes.STRING(100)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.changeColumn("api_keys", "partner_name", {
    allowNull: false,
    field: "partner_name",
    type: DataTypes.STRING(100)
  });
}
