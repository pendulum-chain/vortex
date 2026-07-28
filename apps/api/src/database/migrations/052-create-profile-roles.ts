import { DataTypes, QueryInterface } from "sequelize";

// Per-profile capability roles, managed by admins. Currently only 'discount_manager'
// (may create recipient invites that seed a pricing discount for the accepting profile).
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("profile_roles", {
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    role: {
      allowNull: false,
      type: DataTypes.STRING(32)
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    user_id: {
      allowNull: false,
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "profiles"
      },
      type: DataTypes.UUID
    }
  });

  await queryInterface.sequelize.query(
    `ALTER TABLE "profile_roles" ADD CONSTRAINT "chk_profile_roles_role" CHECK (role IN ('discount_manager'));`
  );
  await queryInterface.addConstraint("profile_roles", {
    fields: ["user_id", "role"],
    name: "uniq_profile_roles_user_role",
    type: "unique"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("profile_roles");
}
