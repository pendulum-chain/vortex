import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Create users table
  await queryInterface.createTable("users", {
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    email: {
      allowNull: false,
      type: DataTypes.STRING(255),
      unique: true
    },
    id: {
      allowNull: false,
      comment: "User ID from Supabase Auth (synced)",
      primaryKey: true,
      type: DataTypes.UUID
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  // Add index on email for faster lookups
  await queryInterface.addIndex("users", ["email"], {
    name: "idx_users_email",
    unique: true
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("users", "idx_users_email");
  await queryInterface.dropTable("users");
}
