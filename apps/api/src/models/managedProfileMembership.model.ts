import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type ManagedProfileMembershipRole = "manager" | "read_only";

export interface ManagedProfileMembershipAttributes {
  id: string;
  ownerProfileId: string;
  memberProfileId: string;
  role: ManagedProfileMembershipRole;
  createdByProfileId: string | null;
  revokedAt: Date | null;
  revokedByProfileId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type ManagedProfileMembershipCreationAttributes = Optional<
  ManagedProfileMembershipAttributes,
  "id" | "createdByProfileId" | "revokedAt" | "revokedByProfileId" | "createdAt" | "updatedAt"
>;

class ManagedProfileMembership
  extends Model<ManagedProfileMembershipAttributes, ManagedProfileMembershipCreationAttributes>
  implements ManagedProfileMembershipAttributes
{
  declare id: string;
  declare ownerProfileId: string;
  declare memberProfileId: string;
  declare role: ManagedProfileMembershipRole;
  declare createdByProfileId: string | null;
  declare revokedAt: Date | null;
  declare revokedByProfileId: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ManagedProfileMembership.init(
  {
    createdAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "created_at", type: DataTypes.DATE },
    createdByProfileId: {
      allowNull: true,
      field: "created_by_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    memberProfileId: {
      allowNull: false,
      field: "member_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    ownerProfileId: {
      allowNull: false,
      field: "owner_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "profile_id", model: "managed_profile_managers" },
      type: DataTypes.UUID
    },
    revokedAt: { allowNull: true, field: "revoked_at", type: DataTypes.DATE },
    revokedByProfileId: {
      allowNull: true,
      field: "revoked_by_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    role: { allowNull: false, type: DataTypes.STRING(16) },
    updatedAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "updated_at", type: DataTypes.DATE }
  },
  {
    indexes: [
      {
        fields: ["member_profile_id"],
        name: "uq_managed_profile_memberships_active",
        unique: true,
        where: { revoked_at: null }
      },
      { fields: ["member_profile_id", "created_at"], name: "idx_managed_profile_memberships_member" },
      { fields: ["owner_profile_id", "created_at", "id"], name: "idx_managed_profile_memberships_owner_created" }
    ],
    modelName: "ManagedProfileMembership",
    sequelize,
    tableName: "managed_profile_memberships",
    timestamps: true
  }
);

export default ManagedProfileMembership;
