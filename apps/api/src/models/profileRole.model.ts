import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Admin-managed capability roles per profile. discount_manager: may attach pricing
// discounts to recipient invites (seeded on acceptance). vortex_admin: may use the
// /v1/admin-console surface, including impersonating another profile.
export type ProfileRoleName = "discount_manager" | "vortex_admin";

export const PROFILE_ROLE_NAMES: ProfileRoleName[] = ["discount_manager", "vortex_admin"];

// Roles grantable through POST /v1/admin/profile-roles, which is guarded only by the shared
// ADMIN_SECRET. vortex_admin confers broad access to act as any customer, so that secret must
// never be sufficient to grant it; it is granted out-of-band instead (see
// scripts/grant-vortex-admin.ts). Revocation stays available for
// every role via DELETE, as a safety valve.
export const HTTP_GRANTABLE_PROFILE_ROLES: ProfileRoleName[] = ["discount_manager"];

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
