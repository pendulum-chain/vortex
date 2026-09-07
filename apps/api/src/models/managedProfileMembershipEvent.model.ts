import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import type { ManagedProfileMembershipRole } from "./managedProfileMembership.model";

export type ManagedProfileMembershipAction =
  | "member_added"
  | "invited"
  | "invitation_cancelled"
  | "invitation_expired"
  | "invitation_accepted"
  | "role_changed"
  | "member_removed";

export interface ManagedProfileMembershipEventAttributes {
  id: string;
  managedProfileId: string;
  action: ManagedProfileMembershipAction;
  actorProfileId: string | null;
  memberProfileId: string | null;
  invitationId: string | null;
  subjectEmail: string | null;
  previousRole: ManagedProfileMembershipRole | null;
  role: ManagedProfileMembershipRole | null;
  createdAt: Date;
}

type ManagedProfileMembershipEventCreationAttributes = Optional<
  ManagedProfileMembershipEventAttributes,
  "id" | "actorProfileId" | "memberProfileId" | "invitationId" | "subjectEmail" | "previousRole" | "role" | "createdAt"
>;

class ManagedProfileMembershipEvent
  extends Model<ManagedProfileMembershipEventAttributes, ManagedProfileMembershipEventCreationAttributes>
  implements ManagedProfileMembershipEventAttributes
{
  declare id: string;
  declare managedProfileId: string;
  declare action: ManagedProfileMembershipAction;
  declare actorProfileId: string | null;
  declare memberProfileId: string | null;
  declare invitationId: string | null;
  declare subjectEmail: string | null;
  declare previousRole: ManagedProfileMembershipRole | null;
  declare role: ManagedProfileMembershipRole | null;
  declare createdAt: Date;
}

ManagedProfileMembershipEvent.init(
  {
    action: { allowNull: false, type: DataTypes.STRING(32) },
    actorProfileId: {
      allowNull: true,
      field: "actor_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    createdAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "created_at", type: DataTypes.DATE },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    invitationId: {
      allowNull: true,
      field: "invitation_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "managed_profile_membership_invitations" },
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
    memberProfileId: {
      allowNull: true,
      field: "member_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    previousRole: { allowNull: true, field: "previous_role", type: DataTypes.STRING(16) },
    role: { allowNull: true, type: DataTypes.STRING(16) },
    subjectEmail: { allowNull: true, field: "subject_email", type: DataTypes.STRING(255) }
  },
  {
    indexes: [
      {
        fields: ["managed_profile_id", { name: "created_at", order: "DESC" }, { name: "id", order: "DESC" }],
        name: "idx_managed_profile_membership_events_child_created"
      }
    ],
    modelName: "ManagedProfileMembershipEvent",
    sequelize,
    tableName: "managed_profile_membership_events",
    timestamps: true,
    updatedAt: false
  }
);

export default ManagedProfileMembershipEvent;
