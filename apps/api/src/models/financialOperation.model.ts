import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type FinancialOperationStatus = "not_started" | "submitted" | "confirmed" | "failed" | "unknown";

export interface FinancialOperationAttributes {
  id: string;
  operationKey: string;
  scopeType: "profile" | "quote" | "ramp";
  scopeId: string;
  flowId: string;
  flowVersion: number;
  phase: string;
  attemptClass: string;
  provider: string;
  requestHash: string;
  status: FinancialOperationStatus;
  externalId: string | null;
  response: unknown | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type FinancialOperationCreationAttributes = Optional<
  FinancialOperationAttributes,
  "id" | "externalId" | "response" | "errorMessage" | "createdAt" | "updatedAt"
>;

class FinancialOperation
  extends Model<FinancialOperationAttributes, FinancialOperationCreationAttributes>
  implements FinancialOperationAttributes
{
  declare id: string;
  declare operationKey: string;
  declare scopeType: "profile" | "quote" | "ramp";
  declare scopeId: string;
  declare flowId: string;
  declare flowVersion: number;
  declare phase: string;
  declare attemptClass: string;
  declare provider: string;
  declare requestHash: string;
  declare status: FinancialOperationStatus;
  declare externalId: string | null;
  declare response: unknown | null;
  declare errorMessage: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

FinancialOperation.init(
  {
    attemptClass: { allowNull: false, field: "attempt_class", type: DataTypes.STRING(64) },
    createdAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "created_at", type: DataTypes.DATE },
    errorMessage: { allowNull: true, field: "error_message", type: DataTypes.STRING(500) },
    externalId: { allowNull: true, field: "external_id", type: DataTypes.STRING(255) },
    flowId: { allowNull: false, field: "flow_id", type: DataTypes.STRING(128) },
    flowVersion: { allowNull: false, field: "flow_version", type: DataTypes.INTEGER },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    operationKey: { allowNull: false, field: "operation_key", type: DataTypes.STRING(64), unique: true },
    phase: { allowNull: false, type: DataTypes.STRING(64) },
    provider: { allowNull: false, type: DataTypes.STRING(64) },
    requestHash: { allowNull: false, field: "request_hash", type: DataTypes.STRING(64) },
    response: { allowNull: true, type: DataTypes.JSONB },
    scopeId: { allowNull: false, field: "scope_id", type: DataTypes.STRING(128) },
    scopeType: {
      allowNull: false,
      field: "scope_type",
      type: DataTypes.STRING(16),
      validate: { isIn: [["profile", "quote", "ramp"]] }
    },
    status: {
      allowNull: false,
      type: DataTypes.STRING(16),
      validate: { isIn: [["not_started", "submitted", "confirmed", "failed", "unknown"]] }
    },
    updatedAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "updated_at", type: DataTypes.DATE }
  },
  {
    indexes: [
      { fields: ["scope_type", "scope_id"], name: "idx_financial_operations_scope" },
      { fields: ["status", "updated_at"], name: "idx_financial_operations_status_updated" }
    ],
    modelName: "FinancialOperation",
    sequelize,
    tableName: "financial_operations",
    timestamps: true
  }
);

export default FinancialOperation;
