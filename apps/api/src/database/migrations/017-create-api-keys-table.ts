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
      allowNull: true,
      comment: "Bcrypt hash for secret keys only (NULL for public keys)",
      field: "key_hash",
      type: DataTypes.STRING(255),
      unique: true
    },
    keyPrefix: {
      allowNull: false,
      comment: "First 8-10 chars for quick lookup (pk_live, sk_live, etc)",
      field: "key_prefix",
      type: DataTypes.STRING(16)
    },
    keyType: {
      allowNull: false,
      defaultValue: "secret",
      field: "key_type",
      type: DataTypes.ENUM("public", "secret")
    },
    keyValue: {
      allowNull: true,
      comment: "Plaintext value for public keys only (NULL for secret keys)",
      field: "key_value",
      type: DataTypes.STRING(255),
      unique: true
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
    partnerName: {
      allowNull: false,
      field: "partner_name",
      type: DataTypes.STRING(100)
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    }
  });

  // Add indexes for performance
  await queryInterface.addIndex("api_keys", ["partner_name"], {
    name: "idx_api_keys_partner_name"
  });

  await queryInterface.addIndex("api_keys", ["key_type"], {
    name: "idx_api_keys_key_type"
  });

  await queryInterface.addIndex("api_keys", ["key_prefix"], {
    name: "idx_api_keys_key_prefix"
  });

  await queryInterface.addIndex("api_keys", ["key_value"], {
    name: "idx_api_keys_key_value"
  });

  await queryInterface.addIndex("api_keys", ["is_active"], {
    name: "idx_api_keys_active"
  });

  // Composite index for active key lookups
  await queryInterface.addIndex("api_keys", ["is_active", "key_prefix", "key_type"], {
    name: "idx_api_keys_active_prefix_type",
    where: { is_active: true }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove indexes
  await queryInterface.removeIndex("api_keys", "idx_api_keys_active_prefix_type");
  await queryInterface.removeIndex("api_keys", "idx_api_keys_active");
  await queryInterface.removeIndex("api_keys", "idx_api_keys_key_value");
  await queryInterface.removeIndex("api_keys", "idx_api_keys_key_prefix");
  await queryInterface.removeIndex("api_keys", "idx_api_keys_key_type");
  await queryInterface.removeIndex("api_keys", "idx_api_keys_partner_name");

  // Drop the api_keys table
  await queryInterface.dropTable("api_keys");
}
