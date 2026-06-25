import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("api_keys", "user_id", {
    allowNull: true,
    field: "user_id",
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "profiles"
    },
    type: DataTypes.UUID
  });

  await queryInterface.addIndex("api_keys", ["user_id"], {
    name: "idx_api_keys_user_id"
  });

  await queryInterface.addIndex("api_keys", ["user_id", "is_active"], {
    name: "idx_api_keys_active_user_lookup"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("api_keys", "idx_api_keys_active_user_lookup");
  await queryInterface.removeIndex("api_keys", "idx_api_keys_user_id");
  await queryInterface.removeColumn("api_keys", "user_id");
}
