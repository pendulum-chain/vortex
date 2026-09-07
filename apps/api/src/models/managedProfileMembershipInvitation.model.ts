import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import type { ManagedProfileMembershipRole } from "./managedProfileMembership.model";

export interface ManagedProfileMembershipInvitationAttributes {
  id: string;
  managedProfileId: string;
  email: string;
  role: ManagedProfileMembershipRole;
  invitedByProfileId: string;
  expiresAt: Date;
  expiredAt: Date | null;
  acceptedAt: Date | null;
  acceptedByProfileId: string | null;
  cancelledAt: Date | null;
  cancelledByProfileId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type ManagedProfileMembershipInvitationCreationAttributes = Optional<
  ManagedProfileMembershipInvitationAttributes,
  "id" | "expiredAt" | "acceptedAt" | "acceptedByProfileId" | "cancelledAt" | "cancelledByProfileId" | "createdAt" | "updatedAt"
>;

class ManagedProfileMembershipInvitation
  extends Model<ManagedProfileMembershipInvitationAttributes, ManagedProfileMembershipInvitationCreationAttributes>
  implements ManagedProfileMembershipInvitationAttributes
{
  declare id: string;
  declare managedProfileId: string;
  declare email: string;
  declare role: ManagedProfileMembershipRole;
  declare invitedByProfileId: string;
  declare expiresAt: Date;
  declare expiredAt: Date | null;
  declare acceptedAt: Date | null;
  declare acceptedByProfileId: string | null;
  declare cancelledAt: Date | null;
  declare cancelledByProfileId: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ManagedProfileMembershipInvitation.init(
  {
    acceptedAt: { allowNull: true, field: "accepted_at", type: DataTypes.DATE },
    acceptedByProfileId: {
      allowNull: true,
      field: "accepted_by_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    cancelledAt: { allowNull: true, field: "cancelled_at", type: DataTypes.DATE },
    cancelledByProfileId: {
      allowNull: true,
      field: "cancelled_by_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    createdAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "created_at", type: DataTypes.DATE },
    email: { allowNull: false, type: DataTypes.STRING(255) },
    expiredAt: { allowNull: true, field: "expired_at", type: DataTypes.DATE },
    expiresAt: { allowNull: false, field: "expires_at", type: DataTypes.DATE },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    invitedByProfileId: {
      allowNull: false,
      field: "invited_by_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    managedProfileId: {
      allowNull: false,
      field: "managed_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "profile_id", model: "managed_profiles" },
      type: DataTypes.UUID
    },
    role: { allowNull: false, type: DataTypes.STRING(16) },
    updatedAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "updated_at", type: DataTypes.DATE }
  },
  {
    indexes: [
      {
        fields: ["managed_profile_id", "email"],
        name: "uq_managed_profile_membership_invitations_pending",
        unique: true,
        where: { accepted_at: null, cancelled_at: null, expired_at: null }
      },
      {
        fields: ["managed_profile_id", "created_at"],
        name: "idx_managed_profile_membership_invitations_child_created"
      }
    ],
    modelName: "ManagedProfileMembershipInvitation",
    sequelize,
    tableName: "managed_profile_membership_invitations",
    timestamps: true
  }
);

export default ManagedProfileMembershipInvitation;
