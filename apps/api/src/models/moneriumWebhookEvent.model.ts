import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Durable inbox for Monerium B2B webhook deliveries (plan §3, R06): rows are inserted
// (dedup on event_id, on conflict do nothing) BEFORE the webhook returns 200 and
// processed asynchronously afterwards. Table created by migration 051.
export interface MoneriumWebhookEventAttributes {
  id: string;
  eventId: string;
  payload: unknown;
  processedAt: Date | null;
  createdAt: Date;
}

type MoneriumWebhookEventCreationAttributes = Optional<MoneriumWebhookEventAttributes, "id" | "processedAt" | "createdAt">;

class MoneriumWebhookEvent
  extends Model<MoneriumWebhookEventAttributes, MoneriumWebhookEventCreationAttributes>
  implements MoneriumWebhookEventAttributes
{
  declare id: string;
  declare eventId: string;
  declare payload: unknown;
  declare processedAt: Date | null;
  declare createdAt: Date;
}

MoneriumWebhookEvent.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    eventId: {
      allowNull: false,
      field: "event_id",
      type: DataTypes.STRING(128),
      unique: true
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    payload: {
      allowNull: false,
      type: DataTypes.JSONB
    },
    processedAt: {
      allowNull: true,
      field: "processed_at",
      type: DataTypes.DATE
    }
  },
  {
    modelName: "MoneriumWebhookEvent",
    sequelize,
    tableName: "monerium_webhook_events",
    // The inbox table has no updated_at column (append + processed_at flip only).
    updatedAt: false
  }
);

export default MoneriumWebhookEvent;
