import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Per-profile notification preferences (plan §8). prefs is an open JSONB bag for
// per-notification-type toggles.
export interface NotificationPreferenceAttributes {
  id: string;
  profileId: string;
  emailEnabled: boolean;
  prefs: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

type NotificationPreferenceCreationAttributes = Optional<
  NotificationPreferenceAttributes,
  "id" | "emailEnabled" | "prefs" | "createdAt" | "updatedAt"
>;

class NotificationPreference
  extends Model<NotificationPreferenceAttributes, NotificationPreferenceCreationAttributes>
  implements NotificationPreferenceAttributes
{
  declare id: string;
  declare profileId: string;
  declare emailEnabled: boolean;
  declare prefs: Record<string, unknown>;
  declare createdAt: Date;
  declare updatedAt: Date;
}

NotificationPreference.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    emailEnabled: {
      allowNull: false,
      defaultValue: true,
      field: "email_enabled",
      type: DataTypes.BOOLEAN
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    prefs: {
      allowNull: false,
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
      type: DataTypes.UUID,
      unique: true
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    }
  },
  {
    modelName: "NotificationPreference",
    sequelize,
    tableName: "notification_preferences",
    timestamps: true
  }
);

export default NotificationPreference;
