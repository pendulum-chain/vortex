import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type ProfileWalletProvider = "privy";
export type ProfileWalletChainType = "ethereum";
export type ProfileWalletStatus = "active" | "archived";

export interface ProfileWalletAttributes {
  id: string;
  profileId: string;
  provider: ProfileWalletProvider;
  providerWalletId: string;
  address: string;
  chainType: ProfileWalletChainType;
  status: ProfileWalletStatus;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type ProfileWalletCreationAttributes = Optional<
  ProfileWalletAttributes,
  "id" | "provider" | "chainType" | "status" | "lastUsedAt" | "createdAt" | "updatedAt"
>;

class ProfileWallet extends Model<ProfileWalletAttributes, ProfileWalletCreationAttributes> implements ProfileWalletAttributes {
  declare id: string;
  declare profileId: string;
  declare provider: ProfileWalletProvider;
  declare providerWalletId: string;
  declare address: string;
  declare chainType: ProfileWalletChainType;
  declare status: ProfileWalletStatus;
  declare lastUsedAt: Date;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ProfileWallet.init(
  {
    address: {
      allowNull: false,
      type: DataTypes.STRING(42)
    },
    chainType: {
      allowNull: false,
      defaultValue: "ethereum",
      field: "chain_type",
      type: DataTypes.STRING(32)
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    lastUsedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "last_used_at",
      type: DataTypes.DATE
    },
    profileId: {
      allowNull: false,
      field: "profile_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "profiles"
      },
      type: DataTypes.UUID
    },
    provider: {
      allowNull: false,
      defaultValue: "privy",
      type: DataTypes.STRING(32)
    },
    providerWalletId: {
      allowNull: false,
      field: "provider_wallet_id",
      type: DataTypes.STRING(255)
    },
    status: {
      allowNull: false,
      defaultValue: "active",
      type: DataTypes.STRING(32)
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
        fields: ["profile_id", "provider", "chain_type"],
        name: "idx_profile_wallets_profile_provider_chain"
      }
    ],
    modelName: "ProfileWallet",
    sequelize,
    tableName: "profile_wallets",
    timestamps: true
  }
);

export default ProfileWallet;
