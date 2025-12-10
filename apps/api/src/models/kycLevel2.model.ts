import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface KycLevel2Attributes {
  id: string;
  userId: string;
  subaccountId: string;
  documentType: "RG" | "CNH";
  uploadData: any;
  status: "Requested" | "DataCollected" | "BrlaValidating" | "Rejected" | "Accepted" | "Cancelled";
  errorLogs: any[];
  createdAt: Date;
  updatedAt: Date;
}

type KycLevel2CreationAttributes = Optional<KycLevel2Attributes, "id" | "createdAt" | "updatedAt" | "errorLogs">;

class KycLevel2 extends Model<KycLevel2Attributes, KycLevel2CreationAttributes> implements KycLevel2Attributes {
  declare id: string;
  declare userId: string;
  declare subaccountId: string;
  declare documentType: "RG" | "CNH";
  declare uploadData: any;
  declare status: "Requested" | "DataCollected" | "BrlaValidating" | "Rejected" | "Accepted" | "Cancelled";
  declare errorLogs: any[];
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
      type: DataTypes.ENUM("RG", "CNH")
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
      defaultValue: "Requested",
      field: "status",
      type: DataTypes.ENUM("Requested", "DataCollected", "BrlaValidating", "Rejected", "Accepted", "Cancelled")
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
        fields: ["subaccount_id"],
        name: "idx_kyc_level_2_subaccount"
      },
      {
        fields: ["status"],
        name: "idx_kyc_level_2_status"
      },
      {
        fields: ["user_id"],
        name: "idx_kyc_level_2_user_id"
      }
    ],
    modelName: "KycLevel2",
    sequelize,
    tableName: "kyc_level_2",
    timestamps: true
  }
);

export default KycLevel2;
