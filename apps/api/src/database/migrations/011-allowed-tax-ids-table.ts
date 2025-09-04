import { DataTypes, QueryInterface } from "sequelize";

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("tax_ids");
}
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("tax_ids", {
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    taxId: {
      primaryKey: true,
      type: DataTypes.STRING
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });
}
