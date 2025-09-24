import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type WebhookEventType = "TRANSACTION_CREATED" | "STATUS_CHANGE";

export interface WebhookAttributes {
  id: string;
  url: string;
  secret: string;
  transactionId: string | null;
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

  declare secret: string;

  declare transactionId: string | null;

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
      defaultValue: ["TRANSACTION_CREATED", "STATUS_CHANGE"],
      type: DataTypes.ARRAY(DataTypes.ENUM("TRANSACTION_CREATED", "STATUS_CHANGE")),
      validate: {
        isValidEventArray(value: WebhookEventType[]) {
          if (!Array.isArray(value) || value.length === 0) {
            throw new Error("events must be a non-empty array");
          }

          const validEvents: WebhookEventType[] = ["TRANSACTION_CREATED", "STATUS_CHANGE"];
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
    secret: {
      allowNull: false,
      type: DataTypes.STRING(255)
    },
    sessionId: {
      allowNull: true,
      field: "session_id",
      type: DataTypes.STRING(255)
    },
    transactionId: {
      allowNull: true,
      field: "transaction_id",
      references: {
        key: "id",
        model: "ramp_states"
      },
      type: DataTypes.UUID
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
        fields: ["transaction_id"],
        name: "idx_webhooks_transaction_id"
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
