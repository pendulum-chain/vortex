import { WebhookPayload } from "@vortexfi/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export enum WebhookDeliveryStatus {
  Pending = "pending",
  Sending = "sending",
  Sent = "sent",
  Abandoned = "abandoned"
}

// Durable outbox row for one (webhook, event) delivery of the account-scoped event
// family. The unique (webhook_id, event_id) pair makes enqueueing idempotent; the
// dispatch worker claims rows, sends with backoff, and abandons after the cap.
export interface WebhookDeliveryAttributes {
  id: string;
  webhookId: string;
  eventId: string;
  eventType: string;
  payload: WebhookPayload;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: Date;
  sentAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type WebhookDeliveryCreationAttributes = Optional<
  WebhookDeliveryAttributes,
  "id" | "status" | "attempts" | "nextAttemptAt" | "sentAt" | "lastError" | "createdAt" | "updatedAt"
>;

class WebhookDelivery
  extends Model<WebhookDeliveryAttributes, WebhookDeliveryCreationAttributes>
  implements WebhookDeliveryAttributes
{
  declare id: string;
  declare webhookId: string;
  declare eventId: string;
  declare eventType: string;
  declare payload: WebhookPayload;
  declare status: WebhookDeliveryStatus;
  declare attempts: number;
  declare nextAttemptAt: Date;
  declare sentAt: Date | null;
  declare lastError: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

WebhookDelivery.init(
  {
    attempts: { allowNull: false, defaultValue: 0, type: DataTypes.INTEGER },
    createdAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "created_at", type: DataTypes.DATE },
    eventId: { allowNull: false, field: "event_id", type: DataTypes.STRING(128) },
    eventType: { allowNull: false, field: "event_type", type: DataTypes.STRING(64) },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    lastError: { allowNull: true, field: "last_error", type: DataTypes.TEXT },
    nextAttemptAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "next_attempt_at", type: DataTypes.DATE },
    payload: { allowNull: false, type: DataTypes.JSONB },
    sentAt: { allowNull: true, field: "sent_at", type: DataTypes.DATE },
    status: { allowNull: false, defaultValue: WebhookDeliveryStatus.Pending, type: DataTypes.STRING(16) },
    updatedAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "updated_at", type: DataTypes.DATE },
    webhookId: { allowNull: false, field: "webhook_id", type: DataTypes.UUID }
  },
  {
    indexes: [{ fields: ["status", "next_attempt_at"] }],
    modelName: "WebhookDelivery",
    sequelize,
    tableName: "webhook_deliveries"
  }
);

export default WebhookDelivery;
