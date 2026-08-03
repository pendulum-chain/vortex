import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("api_credentials", {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    environment: {
      allowNull: false,
      type: DataTypes.ENUM("live", "test")
    },
    expiresAt: {
      allowNull: false,
      field: "expires_at",
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    name: {
      allowNull: false,
      type: DataTypes.STRING(100)
    },
    partnerId: {
      allowNull: true,
      field: "partner_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: { key: "id", model: "partners" },
      type: DataTypes.UUID
    },
    profileId: {
      allowNull: false,
      field: "profile_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    publicKeyValue: {
      allowNull: false,
      field: "public_key_value",
      type: DataTypes.STRING(255)
    },
    publicLastUsedAt: {
      allowNull: true,
      field: "public_last_used_at",
      type: DataTypes.DATE
    },
    revokedAt: {
      allowNull: true,
      field: "revoked_at",
      type: DataTypes.DATE
    },
    secretKeyDigest: {
      allowNull: false,
      field: "secret_key_digest",
      type: DataTypes.STRING(64)
    },
    secretKeyPrefix: {
      allowNull: false,
      field: "secret_key_prefix",
      type: DataTypes.STRING(16)
    },
    secretLastUsedAt: {
      allowNull: true,
      field: "secret_last_used_at",
      type: DataTypes.DATE
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    }
  });

  await queryInterface.addIndex("api_credentials", ["profile_id"], { name: "idx_api_credentials_profile_id" });
  await queryInterface.addIndex("api_credentials", ["partner_id"], { name: "idx_api_credentials_partner_id" });
  await queryInterface.addIndex("api_credentials", ["secret_key_prefix"], {
    name: "idx_api_credentials_secret_key_prefix"
  });
  await queryInterface.addIndex("api_credentials", ["public_key_value"], {
    name: "uq_api_credentials_public_key_value",
    unique: true
  });
  await queryInterface.addIndex("api_credentials", ["secret_key_digest"], {
    name: "uq_api_credentials_secret_key_digest",
    unique: true
  });
  await queryInterface.sequelize.query(`
    ALTER TABLE api_credentials
      ADD CONSTRAINT chk_api_credentials_secret_prefix_length CHECK (char_length(secret_key_prefix) = 16),
      ADD CONSTRAINT chk_api_credentials_secret_digest CHECK (secret_key_digest ~ '^[0-9a-f]{64}$')
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("api_credentials");
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_api_credentials_environment";');
}
