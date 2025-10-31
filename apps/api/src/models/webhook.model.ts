import { WebhookEventType } from "@vortexfi/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface WebhookAttributes {
  id: string;
  url: string;
  quoteId: string | null;
  sessionId: string | null;
  events: WebhookEventType[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookCreationAttributes = Optional<WebhookAttributes, "id" | "createdAt" | "updatedAt" | "isActive">;

class Webhook extends Model<WebhookAttributes, WebhookCreationAttributes> implements WebhookAttributes {
  declare id: string;

  declare url: string;

  declare quoteId: string | null;

  declare sessionId: string | null;

  declare events: WebhookEventType[];

  declare isActive: boolean;

  declare createdAt: Date;

  declare updatedAt: Date;
}

Webhook.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    events: {
      allowNull: false,
      defaultValue: [WebhookEventType.TRANSACTION_CREATED, WebhookEventType.STATUS_CHANGE],
      type: DataTypes.ARRAY(DataTypes.STRING),
      validate: {
        isValidEventArray(value: WebhookEventType[]) {
          if (!Array.isArray(value) || value.length === 0) {
            throw new Error("events must be a non-empty array");
          }

          const validEvents: WebhookEventType[] = [WebhookEventType.TRANSACTION_CREATED, WebhookEventType.STATUS_CHANGE];
          for (const event of value) {
            if (!validEvents.includes(event)) {
              throw new Error(`Invalid event type: ${event}`);
            }
          }
        }
      }
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    isActive: {
      allowNull: false,
      defaultValue: true,
      field: "is_active",
      type: DataTypes.BOOLEAN
    },
    quoteId: {
      allowNull: true,
      field: "quote_id",
      references: {
        key: "id",
        model: "quote_tickets"
      },
      type: DataTypes.UUID
    },
    sessionId: {
      allowNull: true,
      field: "session_id",
      type: DataTypes.STRING(255)
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    url: {
      allowNull: false,
      type: DataTypes.STRING(500),
      validate: {
        isHttps(value: string) {
          if (!value.startsWith("https://")) {
            throw new Error("Webhook URL must use HTTPS");
          }
        },
        isUrl: true
      }
    }
  },
  {
    indexes: [
      {
        fields: ["quote_id"],
        name: "idx_webhooks_quote_id"
      },
      {
        fields: ["session_id"],
        name: "idx_webhooks_session_id"
      },
      {
        fields: ["is_active"],
        name: "idx_webhooks_active"
      },
      {
        fields: ["is_active", "events"],
        name: "idx_webhooks_active_events"
      }
    ],
    modelName: "Webhook",
    sequelize,
    tableName: "webhooks",
    timestamps: true
  }
);

export default Webhook;
