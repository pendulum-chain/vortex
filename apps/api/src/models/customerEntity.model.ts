import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type CustomerEntityType = "individual" | "business";
export type CustomerEntityStatus = "active" | "archived" | "blocked";

// The legal/compliance customer — the owner anchor for provider accounts and KYC cases.
// Sits between profiles (login identity) and the provider/KYC tables.
export interface CustomerEntityAttributes {
  id: string;
  profileId: string | null;
  type: CustomerEntityType;
  country: string | null;
  status: CustomerEntityStatus;
  createdAt: Date;
  updatedAt: Date;
}

type CustomerEntityCreationAttributes = Optional<
  CustomerEntityAttributes,
  "id" | "profileId" | "type" | "country" | "status" | "createdAt" | "updatedAt"
>;

class CustomerEntity
  extends Model<CustomerEntityAttributes, CustomerEntityCreationAttributes>
  implements CustomerEntityAttributes
{
  declare id: string;
  declare profileId: string | null;
  declare type: CustomerEntityType;
  declare country: string | null;
  declare status: CustomerEntityStatus;
  declare createdAt: Date;
  declare updatedAt: Date;
}

CustomerEntity.init(
  {
    country: {
      allowNull: true,
      type: DataTypes.STRING(10)
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    profileId: {
      allowNull: true,
      field: "profile_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "profiles"
      },
      type: DataTypes.UUID
    },
    status: {
      allowNull: false,
      defaultValue: "active",
      type: DataTypes.STRING(20)
    },
    type: {
      allowNull: false,
      defaultValue: "individual",
      type: DataTypes.STRING(20)
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
        fields: ["profile_id"],
        name: "idx_customer_entities_profile_id"
      }
    ],
    modelName: "CustomerEntity",
    sequelize,
    tableName: "customer_entities",
    timestamps: true
  }
);

export default CustomerEntity;
