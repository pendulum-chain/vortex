import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type ApiCredentialEnvironment = "live" | "test";

export interface ApiCredentialAttributes {
  id: string;
  name: string;
  profileId: string;
  partnerId: string | null;
  environment: ApiCredentialEnvironment;
  publicKeyValue: string;
  publicLastUsedAt: Date | null;
  secretKeyPrefix: string;
  secretKeyDigest: string;
  secretLastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type ApiCredentialCreationAttributes = Optional<
  ApiCredentialAttributes,
  "id" | "partnerId" | "publicLastUsedAt" | "secretLastUsedAt" | "revokedAt" | "createdAt" | "updatedAt"
>;

class ApiCredential extends Model<ApiCredentialAttributes, ApiCredentialCreationAttributes> implements ApiCredentialAttributes {
  declare id: string;
  declare name: string;
  declare profileId: string;
  declare partnerId: string | null;
  declare environment: ApiCredentialEnvironment;
  declare publicKeyValue: string;
  declare publicLastUsedAt: Date | null;
  declare secretKeyPrefix: string;
  declare secretKeyDigest: string;
  declare secretLastUsedAt: Date | null;
  declare expiresAt: Date;
  declare revokedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ApiCredential.init(
  {
    createdAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "created_at", type: DataTypes.DATE },
    environment: { allowNull: false, type: DataTypes.ENUM("live", "test") },
    expiresAt: { allowNull: false, field: "expires_at", type: DataTypes.DATE },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    name: { allowNull: false, type: DataTypes.STRING(100) },
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
    publicKeyValue: { allowNull: false, field: "public_key_value", type: DataTypes.STRING(255), unique: true },
    publicLastUsedAt: { allowNull: true, field: "public_last_used_at", type: DataTypes.DATE },
    revokedAt: { allowNull: true, field: "revoked_at", type: DataTypes.DATE },
    secretKeyDigest: { allowNull: false, field: "secret_key_digest", type: DataTypes.STRING(64), unique: true },
    secretKeyPrefix: { allowNull: false, field: "secret_key_prefix", type: DataTypes.STRING(16) },
    secretLastUsedAt: { allowNull: true, field: "secret_last_used_at", type: DataTypes.DATE },
    updatedAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "updated_at", type: DataTypes.DATE }
  },
  {
    indexes: [
      { fields: ["profile_id"], name: "idx_api_credentials_profile_id" },
      { fields: ["partner_id"], name: "idx_api_credentials_partner_id" },
      { fields: ["secret_key_prefix"], name: "idx_api_credentials_secret_key_prefix" }
    ],
    sequelize,
    tableName: "api_credentials",
    timestamps: true
  }
);

export default ApiCredential;
