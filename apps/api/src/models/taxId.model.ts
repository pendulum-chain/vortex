import { AveniaAccountType } from "@packages/shared/src/services";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Define the attributes of the TaxId model
export interface TaxIdAttributes {
  taxId: string;
  userId: string; // UUID reference to Supabase Auth user
  subAccountId: string;
  accountType: AveniaAccountType;
  kycAttempt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
type TaxIdCreationAttributes = Optional<TaxIdAttributes, "createdAt" | "updatedAt" | "kycAttempt">;

// Define the TaxId model
class TaxId extends Model<TaxIdAttributes, TaxIdCreationAttributes> implements TaxIdAttributes {
  declare taxId: string;
  declare userId: string;
  declare subAccountId: string;
  declare accountType: AveniaAccountType;
  declare kycAttempt: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

// Initialize the model
TaxId.init(
  {
    accountType: {
      allowNull: false,
      field: "account_type",
      type: DataTypes.ENUM(...Object.values(AveniaAccountType))
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    kycAttempt: {
      allowNull: true,
      field: "kyc_attempt",
      type: DataTypes.STRING
    },
    subAccountId: {
      allowNull: false,
      field: "sub_account_id",
      type: DataTypes.STRING
    },
    taxId: {
      field: "tax_id",
      primaryKey: true,
      type: DataTypes.STRING
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    userId: {
      allowNull: false,
      field: "user_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "users"
      },
      type: DataTypes.UUID
    }
  },
  {
    indexes: [
      {
        fields: ["sub_account_id"],
        name: "idx_tax_ids_sub_account_id"
      }
    ],
    modelName: "TaxId",
    sequelize,
    tableName: "tax_ids",
    timestamps: true
  }
);

export default TaxId;
