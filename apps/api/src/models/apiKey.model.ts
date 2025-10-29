import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Define the attributes of the ApiKey model
export interface ApiKeyAttributes {
  id: string;
  partnerName: string;
  keyHash: string;
  keyPrefix: string;
  name: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
type ApiKeyCreationAttributes = Optional<
  ApiKeyAttributes,
  "id" | "name" | "lastUsedAt" | "expiresAt" | "createdAt" | "updatedAt"
>;

// Define the ApiKey model
class ApiKey extends Model<ApiKeyAttributes, ApiKeyCreationAttributes> implements ApiKeyAttributes {
  declare id: string;

  declare partnerName: string;

  declare keyHash: string;

  declare keyPrefix: string;

  declare name: string | null;

  declare lastUsedAt: Date | null;

  declare expiresAt: Date | null;

  declare isActive: boolean;

  declare createdAt: Date;

  declare updatedAt: Date;

  // Association helper - partners with this name
  declare partners?: any[];
}

// Initialize the model
ApiKey.init(
  {
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
  },
  {
    indexes: [
      {
        fields: ["partner_name"],
        name: "idx_api_keys_partner_name"
      },
      {
        fields: ["key_prefix"],
        name: "idx_api_keys_key_prefix"
      },
      {
        fields: ["is_active"],
        name: "idx_api_keys_active"
      },
      {
        fields: ["is_active", "key_prefix"],
        name: "idx_api_keys_active_prefix",
        where: { isActive: true }
      }
    ],
    sequelize,
    tableName: "api_keys",
    timestamps: true
  }
);

export default ApiKey;
