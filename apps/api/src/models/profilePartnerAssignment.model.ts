import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface ProfilePartnerAssignmentAttributes {
  id: string;
  userId: string;
  partnerName: string;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type ProfilePartnerAssignmentCreationAttributes = Optional<
  ProfilePartnerAssignmentAttributes,
  "id" | "createdAt" | "updatedAt" | "isActive" | "expiresAt"
>;

class ProfilePartnerAssignment
  extends Model<ProfilePartnerAssignmentAttributes, ProfilePartnerAssignmentCreationAttributes>
  implements ProfilePartnerAssignmentAttributes
{
  declare id: string;

  declare userId: string;

  declare partnerName: string;

  declare isActive: boolean;

  declare expiresAt: Date | null;

  declare createdAt: Date;

  declare updatedAt: Date;
}

ProfilePartnerAssignment.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    expiresAt: {
      allowNull: true,
      field: "expires_at",
      type: DataTypes.DATE
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
    partnerName: {
      allowNull: false,
      field: "partner_name",
      type: DataTypes.STRING(100)
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    userId: {
      allowNull: false,
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
        fields: ["user_id"],
        name: "idx_profile_partner_assignments_user_id"
      },
      {
        fields: ["partner_name"],
        name: "idx_profile_partner_assignments_partner_name"
      },
      {
        fields: ["user_id", "is_active", "expires_at"],
        name: "idx_profile_partner_assignments_active_lookup"
      }
    ],
    modelName: "ProfilePartnerAssignment",
    sequelize,
    tableName: "profile_partner_assignments",
    timestamps: true
  }
);

export default ProfilePartnerAssignment;
