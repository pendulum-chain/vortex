import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Admin-managed capability roles per profile. discount_manager: may attach pricing
// discounts to recipient invites (seeded on acceptance).
export type ProfileRoleName = "discount_manager";

export const PROFILE_ROLE_NAMES: ProfileRoleName[] = ["discount_manager"];

export interface ProfileRoleAttributes {
  id: string;
  userId: string;
  role: ProfileRoleName;
  createdAt: Date;
  updatedAt: Date;
}

type ProfileRoleCreationAttributes = Optional<ProfileRoleAttributes, "id" | "createdAt" | "updatedAt">;

class ProfileRole extends Model<ProfileRoleAttributes, ProfileRoleCreationAttributes> implements ProfileRoleAttributes {
  declare id: string;
  declare userId: string;
  declare role: ProfileRoleName;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ProfileRole.init(
  {
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
    role: {
      allowNull: false,
      type: DataTypes.STRING(32)
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
        fields: ["user_id", "role"],
        name: "uniq_profile_roles_user_role",
        unique: true
      }
    ],
    modelName: "ProfileRole",
    sequelize,
    tableName: "profile_roles",
    timestamps: true
  }
);

export default ProfileRole;
