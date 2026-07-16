import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// In-app notification feed row (plan §8). type is an open vocabulary (e.g.
// onboarding_status_changed, invite_created, ramp_completed).
export interface NotificationAttributes {
  id: string;
  profileId: string;
  customerEntityId: string | null;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type NotificationCreationAttributes = Optional<
  NotificationAttributes,
  "id" | "customerEntityId" | "body" | "metadata" | "readAt" | "createdAt" | "updatedAt"
>;

class Notification extends Model<NotificationAttributes, NotificationCreationAttributes> implements NotificationAttributes {
  declare id: string;
  declare profileId: string;
  declare customerEntityId: string | null;
  declare type: string;
  declare title: string;
  declare body: string | null;
  declare metadata: Record<string, unknown> | null;
  declare readAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Notification.init(
  {
    body: {
      allowNull: true,
      type: DataTypes.TEXT
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    customerEntityId: {
      allowNull: true,
      field: "customer_entity_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "customer_entities"
      },
      type: DataTypes.UUID
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    metadata: {
      allowNull: true,
      defaultValue: {},
      type: DataTypes.JSONB
    },
    profileId: {
      allowNull: false,
      field: "profile_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "profiles"
      },
      type: DataTypes.UUID
    },
    readAt: {
      allowNull: true,
      field: "read_at",
      type: DataTypes.DATE
    },
    title: {
      allowNull: false,
      type: DataTypes.STRING(255)
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
    }
  },
  {
    indexes: [
      {
        fields: ["profile_id", "created_at"],
        name: "idx_notifications_profile_created"
      }
    ],
    modelName: "Notification",
    sequelize,
    tableName: "notifications",
    timestamps: true
  }
);

export default Notification;
