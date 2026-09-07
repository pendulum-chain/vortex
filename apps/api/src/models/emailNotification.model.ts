import { EmailNotificationType } from "@vortexfi/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Upstream system a notification originates from. Stored as a plain string so
// adding a provider does not require a schema migration.
export enum NotificationProvider {
  Alfredpay = "alfredpay",
  Avenia = "avenia",
  Vortex = "vortex"
}

// Profile notification types are shared with the dashboard's preference toggles.
// Invitations are server-only account-access mail, not a preference-controlled type.
export const NotificationType = {
  ...EmailNotificationType,
  ManagedProfileMembershipInvitation: "managed_profile_membership_invitation"
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export enum NotificationStatus {
  Abandoned = "abandoned",
  Failed = "failed",
  Pending = "pending",
  // Claimed by a dispatch cycle. Both flow-variant backends share one database,
  // so a row must be claimed before sending or a user gets the same email twice.
  Sending = "sending",
  Sent = "sent",
  Skipped = "skipped"
}

// Identifies the event a notification was raised for. Backed by the unique index
// on (provider, type, resource_id), which is what makes enqueuing idempotent.
export interface NotificationKey {
  provider: NotificationProvider;
  type: NotificationType;
  resourceId: string;
}

export interface EmailNotificationAttributes {
  id: string;
  provider: NotificationProvider;
  type: NotificationType;
  userId: string | null;
  recipientEmail: string | null;
  resourceId: string;
  locale: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  attempts: number;
  nextAttemptAt: Date;
  sentAt: Date | null;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type EmailNotificationCreationAttributes = Optional<
  EmailNotificationAttributes,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "payload"
  | "status"
  | "attempts"
  | "nextAttemptAt"
  | "sentAt"
  | "providerMessageId"
  | "lastError"
  | "recipientEmail"
>;

class EmailNotification
  extends Model<EmailNotificationAttributes, EmailNotificationCreationAttributes>
  implements EmailNotificationAttributes
{
  declare id: string;

  declare provider: NotificationProvider;

  declare type: NotificationType;

  declare userId: string | null;

  declare recipientEmail: string | null;

  declare resourceId: string;

  declare locale: string;

  declare payload: Record<string, unknown>;

  declare status: NotificationStatus;

  declare attempts: number;

  declare nextAttemptAt: Date;

  declare sentAt: Date | null;

  declare providerMessageId: string | null;

  declare lastError: string | null;

  declare createdAt: Date;

  declare updatedAt: Date;
}

EmailNotification.init(
  {
    attempts: {
      allowNull: false,
      defaultValue: 0,
      type: DataTypes.INTEGER
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    lastError: {
      allowNull: true,
      field: "last_error",
      type: DataTypes.TEXT
    },
    locale: {
      allowNull: false,
      type: DataTypes.STRING(10)
    },
    nextAttemptAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "next_attempt_at",
      type: DataTypes.DATE
    },
    payload: {
      allowNull: false,
      defaultValue: {},
      type: DataTypes.JSONB
    },
    provider: {
      allowNull: false,
      type: DataTypes.STRING(32)
    },
    providerMessageId: {
      allowNull: true,
      field: "provider_message_id",
      type: DataTypes.STRING(255)
    },
    recipientEmail: {
      allowNull: true,
      field: "recipient_email",
      type: DataTypes.STRING(254)
    },
    resourceId: {
      allowNull: false,
      field: "resource_id",
      type: DataTypes.STRING(255)
    },
    sentAt: {
      allowNull: true,
      field: "sent_at",
      type: DataTypes.DATE
    },
    status: {
      allowNull: false,
      defaultValue: NotificationStatus.Pending,
      type: DataTypes.STRING(16)
    },
    type: {
      allowNull: false,
      type: DataTypes.STRING(64)
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    userId: {
      allowNull: true,
      field: "user_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "profiles"
      },
      type: DataTypes.UUID
    }
  },
  {
    indexes: [
      {
        fields: ["provider", "type", "resource_id"],
        name: "uniq_email_notifications_provider_type_resource",
        unique: true
      },
      {
        fields: ["status", "next_attempt_at"],
        name: "idx_email_notifications_dispatch"
      }
    ],
    modelName: "EmailNotification",
    sequelize,
    tableName: "email_notifications",
    timestamps: true
  }
);

export default EmailNotification;
