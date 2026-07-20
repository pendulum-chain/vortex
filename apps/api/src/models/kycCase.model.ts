import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import type { ProviderName, VerificationStatus } from "./providerCustomer.model";

export type KycCaseType = "kyc" | "kyb";

// Unified KYC/KYB verification attempts, independent of the provider account row.
// Replaces the dead kyc_level_2 table (no data conversion — it had no readers).
export interface KycCaseAttributes {
  id: string;
  customerEntityId: string;
  providerCustomerId: string | null;
  provider: ProviderName;
  level: string | null;
  type: KycCaseType;
  status: VerificationStatus;
  statusExternal: string | null;
  providerCaseId: string | null;
  failureReasons: string[] | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type KycCaseCreationAttributes = Optional<
  KycCaseAttributes,
  | "id"
  | "providerCustomerId"
  | "level"
  | "type"
  | "statusExternal"
  | "providerCaseId"
  | "failureReasons"
  | "submittedAt"
  | "approvedAt"
  | "rejectedAt"
  | "createdAt"
  | "updatedAt"
>;

class KycCase extends Model<KycCaseAttributes, KycCaseCreationAttributes> implements KycCaseAttributes {
  declare id: string;
  declare customerEntityId: string;
  declare providerCustomerId: string | null;
  declare provider: ProviderName;
  declare level: string | null;
  declare type: KycCaseType;
  declare status: VerificationStatus;
  declare statusExternal: string | null;
  declare providerCaseId: string | null;
  declare failureReasons: string[] | null;
  declare submittedAt: Date | null;
  declare approvedAt: Date | null;
  declare rejectedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

KycCase.init(
  {
    approvedAt: {
      allowNull: true,
      field: "approved_at",
      type: DataTypes.DATE
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    customerEntityId: {
      allowNull: false,
      field: "customer_entity_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "customer_entities"
      },
      type: DataTypes.UUID
    },
    failureReasons: {
      allowNull: true,
      defaultValue: [],
      field: "failure_reasons",
      type: DataTypes.JSONB
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    level: {
      allowNull: true,
      type: DataTypes.STRING(16)
    },
    provider: {
      allowNull: false,
      type: DataTypes.STRING(16)
    },
    providerCaseId: {
      allowNull: true,
      field: "provider_case_id",
      type: DataTypes.STRING(255)
    },
    providerCustomerId: {
      allowNull: true,
      field: "provider_customer_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "provider_customers"
      },
      type: DataTypes.UUID
    },
    rejectedAt: {
      allowNull: true,
      field: "rejected_at",
      type: DataTypes.DATE
    },
    status: {
      allowNull: false,
      type: DataTypes.STRING(32)
    },
    statusExternal: {
      allowNull: true,
      field: "status_external",
      type: DataTypes.STRING(255)
    },
    submittedAt: {
      allowNull: true,
      field: "submitted_at",
      type: DataTypes.DATE
    },
    type: {
      allowNull: false,
      defaultValue: "kyc",
      type: DataTypes.STRING(8)
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
        fields: ["customer_entity_id"],
        name: "idx_kyc_cases_customer_entity_id"
      },
      {
        fields: ["provider_customer_id"],
        name: "idx_kyc_cases_provider_customer_id"
      }
    ],
    modelName: "KycCase",
    sequelize,
    tableName: "kyc_cases",
    timestamps: true
  }
);

export default KycCase;
