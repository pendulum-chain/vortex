import { BrlaKYCDocType, KycLevel2Response } from "@packages/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export enum KycLevel2Status {
  REQUESTED = "Requested", // Requested by the user. Was sent (by the UI) to brla for processing.
  REJECTED = "Rejected",
  ACCEPTED = "Accepted",
  CANCELLED = "Cancelled"
}

export interface KycLevel2Attributes {
  id: string;
  subaccountId: string;
  documentType: BrlaKYCDocType;
  status: KycLevel2Status;
  errorLogs: unknown[];
  uploadData: KycLevel2Response;
  createdAt: Date;
  updatedAt: Date;
}

type KycLevel2CreationAttributes = Optional<KycLevel2Attributes, "id" | "errorLogs" | "uploadData" | "createdAt" | "updatedAt">;

class KycLevel2 extends Model<KycLevel2Attributes, KycLevel2CreationAttributes> implements KycLevel2Attributes {
  declare id: string; // Doubles as token. TODO: is that safe?
  declare subaccountId: string;
  declare documentType: BrlaKYCDocType;
  declare status: KycLevel2Status;
  declare errorLogs: unknown[];
  declare uploadData: KycLevel2Response;
  declare createdAt: Date;
  declare updatedAt: Date;
}

KycLevel2.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    documentType: {
      allowNull: false,
      field: "document_type",
      type: DataTypes.ENUM(...Object.values(BrlaKYCDocType))
    },
    errorLogs: {
      allowNull: false,
      defaultValue: [],
      field: "error_logs",
      type: DataTypes.JSONB
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    status: {
      allowNull: false,
      defaultValue: KycLevel2Status.REQUESTED,
      field: "status",
      type: DataTypes.ENUM(...Object.values(KycLevel2Status))
    },
    subaccountId: {
      allowNull: false,
      field: "subaccount_id",
      type: DataTypes.STRING
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    uploadData: {
      allowNull: false,
      field: "upload_data",
      type: DataTypes.JSONB
    }
  },
  {
    indexes: [
      {
        fields: ["subaccount_id"],
        name: "idx_kyc_level_2_subaccount"
      },
      {
        fields: ["status"],
        name: "idx_kyc_level_2_status"
      }
    ],
    modelName: "KycLevel2",
    sequelize,
    tableName: "kyc_level_2",
    timestamps: true
  }
);

export default KycLevel2;
