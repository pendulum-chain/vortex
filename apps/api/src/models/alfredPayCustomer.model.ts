import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export enum AlfredPayStatus {
  Consulted = "CONSULTED",
  LinkOpened = "LINK_OPENED",
  UserCompleted = "USER_COMPLETED",
  Verifying = "VERIFYING",
  Failed = "FAILED",
  Success = "SUCCESS"
}

export enum AlfredPayCountry {
  MX = "MX", // Mexico
  AR = "AR", // Argentina
  BR = "BR", // Brazil
  CO = "CO", // Colombia
  DO = "DO", // Dominican Republic
  US = "US", // United States
  CN = "CN", // China
  HK = "HK", // Hong Kong
  CL = "CL", // Chile
  PE = "PE", // Peru
  BO = "BO" // Bolivia
}

export enum AlfredPayType {
  Individual = "INDIVIDUAL",
  Business = "BUSINESS"
}

export interface AlfredPayCustomerAttributes {
  id: string; // Internal PK
  userId: string; // Foreign key to User (profiles.id)
  alfredPayId: string; // Alfredpay's user ID
  email: string;
  country: AlfredPayCountry;
  status: AlfredPayStatus;
  statusExternal: string | null;
  lastFailureReasons: string[] | null;
  type: AlfredPayType;
  createdAt: Date;
  updatedAt: Date;
}

type AlfredPayCustomerCreationAttributes = Optional<
  AlfredPayCustomerAttributes,
  "id" | "createdAt" | "updatedAt" | "statusExternal" | "lastFailureReasons"
>;

class AlfredPayCustomer
  extends Model<AlfredPayCustomerAttributes, AlfredPayCustomerCreationAttributes>
  implements AlfredPayCustomerAttributes
{
  declare id: string;
  declare userId: string;
  declare alfredPayId: string;
  declare email: string;
  declare country: AlfredPayCountry;
  declare status: AlfredPayStatus;
  declare statusExternal: string | null;
  declare lastFailureReasons: string[] | null;
  declare type: AlfredPayType;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AlfredPayCustomer.init(
  {
    alfredPayId: {
      allowNull: false,
      comment: "Alfredpay's user ID",
      field: "alfred_pay_id",
      type: DataTypes.STRING,
      unique: true
    },
    country: {
      allowNull: false,
      type: DataTypes.ENUM(...Object.values(AlfredPayCountry))
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    email: {
      allowNull: false,
      type: DataTypes.STRING,
      validate: {
        isEmail: true
      }
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    lastFailureReasons: {
      allowNull: true,
      defaultValue: [],
      field: "last_failure_reasons",
      type: DataTypes.ARRAY(DataTypes.STRING)
    },
    status: {
      allowNull: false,
      defaultValue: AlfredPayStatus.Consulted,
      type: DataTypes.ENUM(...Object.values(AlfredPayStatus))
    },
    statusExternal: {
      allowNull: true,
      comment: "Alfredpay's direct status",
      field: "status_external",
      type: DataTypes.STRING
    },
    type: {
      allowNull: false,
      defaultValue: AlfredPayType.Individual,
      type: DataTypes.ENUM(...Object.values(AlfredPayType))
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
        model: "profiles"
      },
      type: DataTypes.UUID
    }
  },
  {
    indexes: [
      {
        fields: ["user_id"],
        name: "idx_alfredpay_customers_user_id"
      },
      {
        fields: ["alfred_pay_id"],
        name: "idx_alfredpay_customers_alfred_pay_id",
        unique: true
      },
      {
        fields: ["email"],
        name: "idx_alfredpay_customers_email"
      }
    ],
    modelName: "AlfredPayCustomer",
    sequelize, // Following convention
    tableName: "alfredpay_customers",
    timestamps: true
  }
);

export default AlfredPayCustomer;
