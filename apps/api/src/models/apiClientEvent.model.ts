import { DataTypes, Model, Optional } from "sequelize";
import { ApiClientErrorType, ApiClientEventStatus, ApiClientOperation } from "../api/observability/types";
import sequelize from "../config/database";

export interface ApiClientEventAttributes {
  id: string;
  requestId: string | null;
  operation: ApiClientOperation;
  status: ApiClientEventStatus;
  httpStatus: number | null;
  errorType: ApiClientErrorType | null;
  errorMessage: string | null;
  partnerId: string | null;
  partnerName: string | null;
  apiKeyPrefix: string | null;
  userId: string | null;
  quoteId: string | null;
  rampId: string | null;
  rampType: string | null;
  network: string | null;
  paymentMethod: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ApiClientEventCreationAttributes = Optional<ApiClientEventAttributes, "id" | "createdAt" | "updatedAt">;

class ApiClientEvent
  extends Model<ApiClientEventAttributes, ApiClientEventCreationAttributes>
  implements ApiClientEventAttributes
{
  declare id: string;
  declare requestId: string | null;
  declare operation: ApiClientOperation;
  declare status: ApiClientEventStatus;
  declare httpStatus: number | null;
  declare errorType: ApiClientErrorType | null;
  declare errorMessage: string | null;
  declare partnerId: string | null;
  declare partnerName: string | null;
  declare apiKeyPrefix: string | null;
  declare userId: string | null;
  declare quoteId: string | null;
  declare rampId: string | null;
  declare rampType: string | null;
  declare network: string | null;
  declare paymentMethod: string | null;
  declare durationMs: number | null;
  declare metadata: Record<string, unknown> | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ApiClientEvent.init(
  {
    apiKeyPrefix: { allowNull: true, field: "api_key_prefix", type: DataTypes.STRING(16) },
    createdAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "created_at", type: DataTypes.DATE },
    durationMs: { allowNull: true, field: "duration_ms", type: DataTypes.INTEGER },
    errorMessage: { allowNull: true, field: "error_message", type: DataTypes.STRING(300) },
    errorType: { allowNull: true, field: "error_type", type: DataTypes.STRING(64) },
    httpStatus: { allowNull: true, field: "http_status", type: DataTypes.INTEGER },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    metadata: { allowNull: true, type: DataTypes.JSONB },
    network: { allowNull: true, type: DataTypes.STRING(32) },
    operation: { allowNull: false, type: DataTypes.STRING(64) },
    partnerId: { allowNull: true, field: "partner_id", type: DataTypes.UUID },
    partnerName: { allowNull: true, field: "partner_name", type: DataTypes.STRING(100) },
    paymentMethod: { allowNull: true, field: "payment_method", type: DataTypes.STRING(32) },
    quoteId: { allowNull: true, field: "quote_id", type: DataTypes.UUID },
    rampId: { allowNull: true, field: "ramp_id", type: DataTypes.UUID },
    rampType: { allowNull: true, field: "ramp_type", type: DataTypes.STRING(16) },
    requestId: { allowNull: true, field: "request_id", type: DataTypes.STRING(128) },
    status: { allowNull: false, type: DataTypes.STRING(16) },
    updatedAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "updated_at", type: DataTypes.DATE },
    userId: { allowNull: true, field: "user_id", type: DataTypes.UUID }
  },
  {
    indexes: [
      { fields: [{ name: "created_at", order: "DESC" }], name: "idx_api_client_events_created_at" },
      { fields: ["partner_id", "created_at"], name: "idx_api_client_events_partner_id_created_at" },
      { fields: ["partner_name", "created_at"], name: "idx_api_client_events_partner_name_created_at" },
      { fields: ["operation", "created_at"], name: "idx_api_client_events_operation_created_at" },
      { fields: ["status", "created_at"], name: "idx_api_client_events_status_created_at" },
      { fields: ["error_type", "created_at"], name: "idx_api_client_events_error_type_created_at" },
      { fields: ["api_key_prefix", "created_at"], name: "idx_api_client_events_api_key_prefix_created_at" },
      { fields: ["request_id"], name: "idx_api_client_events_request_id" },
      { fields: ["quote_id"], name: "idx_api_client_events_quote_id" },
      { fields: ["ramp_id"], name: "idx_api_client_events_ramp_id" }
    ],
    modelName: "ApiClientEvent",
    sequelize,
    tableName: "api_client_events",
    timestamps: true
  }
);

export default ApiClientEvent;
