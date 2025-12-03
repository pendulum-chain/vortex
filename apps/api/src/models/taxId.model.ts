import { AveniaAccountType } from "@vortexfi/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export enum TaxIdInternalStatus {
  Consulted = "Consulted",
  Requested = "Requested",
  Accepted = "Accepted",
  Rejected = "Rejected"
}

// Define the attributes of the TaxId model
export interface TaxIdAttributes {
  taxId: string;
  subAccountId: string;
  accountType: AveniaAccountType;
  kycAttempt: string | null;
  initialQuoteId: string | null;
  initialSessionId: string | null;
  finalQuoteId: string | null;
  finalSessionId: string | null;
  finalTimestamp: Date | null;
  internalStatus: TaxIdInternalStatus | null;
  requestedDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
type TaxIdCreationAttributes = Optional<
  TaxIdAttributes,
  | "createdAt"
  | "updatedAt"
  | "kycAttempt"
  | "initialQuoteId"
  | "initialSessionId"
  | "finalQuoteId"
  | "finalSessionId"
  | "finalTimestamp"
  | "internalStatus"
  | "requestedDate"
>;

// Define the TaxId model
class TaxId extends Model<TaxIdAttributes, TaxIdCreationAttributes> implements TaxIdAttributes {
  declare taxId: string;
  declare subAccountId: string;
  declare accountType: AveniaAccountType;
  declare kycAttempt: string | null;
  declare initialQuoteId: string | null;
  declare initialSessionId: string | null;
  declare finalQuoteId: string | null;
  declare finalSessionId: string | null;
  declare finalTimestamp: Date | null;
  declare internalStatus: TaxIdInternalStatus | null;
  declare requestedDate: Date | null;
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
    finalQuoteId: {
      allowNull: true,
      field: "final_quote_id",
      type: DataTypes.STRING
    },
    finalSessionId: {
      allowNull: true,
      field: "final_session_id",
      type: DataTypes.STRING
    },
    finalTimestamp: {
      allowNull: true,
      field: "final_timestamp",
      type: DataTypes.DATE
    },
    initialQuoteId: {
      allowNull: true,
      field: "initial_quote_id",
      type: DataTypes.STRING
    },
    initialSessionId: {
      allowNull: true,
      field: "initial_session_id",
      type: DataTypes.STRING
    },
    internalStatus: {
      allowNull: true,
      field: "internal_status",
      type: DataTypes.ENUM(...Object.values(TaxIdInternalStatus))
    },
    kycAttempt: {
      allowNull: true,
      field: "kyc_attempt",
      type: DataTypes.STRING
    },
    requestedDate: {
      allowNull: true,
      field: "requested_date",
      type: DataTypes.DATE
    },
    subAccountId: {
      allowNull: true,
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
