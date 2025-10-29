import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Create api_keys table
  await queryInterface.createTable("api_keys", {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    expiresAt: {
      allowNull: true,
      field: "expires_at",
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    isActive: {
      allowNull: false,
      defaultValue: true,
      field: "is_active",
      type: DataTypes.BOOLEAN
    },
    keyHash: {
      allowNull: false,
      field: "key_hash",
      type: DataTypes.STRING(255),
      unique: true
    },
    keyPrefix: {
      allowNull: false,
      field: "key_prefix",
      type: DataTypes.STRING(16)
    },
    lastUsedAt: {
      allowNull: true,
      field: "last_used_at",
      type: DataTypes.DATE
    },
    name: {
      allowNull: true,
      type: DataTypes.STRING(100)
    },
    partnerId: {
      allowNull: false,
      field: "partner_id",
      onDelete: "CASCADE",
      references: {
        key: "id",
        model: "partners"
      },
      type: DataTypes.UUID
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    }
  });

  // Add indexes for performance
  await queryInterface.addIndex("api_keys", ["partner_id"], {
    name: "idx_api_keys_partner_id"
  });

  await queryInterface.addIndex("api_keys", ["key_prefix"], {
    name: "idx_api_keys_key_prefix"
  });

  await queryInterface.addIndex("api_keys", ["is_active"], {
    name: "idx_api_keys_active"
  });

  // Composite index for active key lookups
  await queryInterface.addIndex("api_keys", ["is_active", "key_prefix"], {
    name: "idx_api_keys_active_prefix",
    where: { is_active: true }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove indexes
  await queryInterface.removeIndex("api_keys", "idx_api_keys_active_prefix");
  await queryInterface.removeIndex("api_keys", "idx_api_keys_active");
  await queryInterface.removeIndex("api_keys", "idx_api_keys_key_prefix");
  await queryInterface.removeIndex("api_keys", "idx_api_keys_partner_id");

  // Drop the api_keys table
  await queryInterface.dropTable("api_keys");
}
