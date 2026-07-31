import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export const MANAGED_PROFILE_SUBJECT_TYPES = ["individual", "business", "technical"] as const;
export type ManagedProfileSubjectType = (typeof MANAGED_PROFILE_SUBJECT_TYPES)[number];

export interface PartnerManagedProfileAttributes {
  id: string;
  partnerId: string;
  profileId: string;
  externalUserId: string;
  subjectType: ManagedProfileSubjectType;
  claimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type PartnerManagedProfileCreationAttributes = Optional<
  PartnerManagedProfileAttributes,
  "id" | "claimedAt" | "createdAt" | "updatedAt"
>;

class PartnerManagedProfile
  extends Model<PartnerManagedProfileAttributes, PartnerManagedProfileCreationAttributes>
  implements PartnerManagedProfileAttributes
{
  declare id: string;
  declare partnerId: string;
  declare profileId: string;
  declare externalUserId: string;
  declare subjectType: ManagedProfileSubjectType;
  declare claimedAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

PartnerManagedProfile.init(
  {
    claimedAt: { allowNull: true, field: "claimed_at", type: DataTypes.DATE },
    createdAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "created_at", type: DataTypes.DATE },
    externalUserId: { allowNull: false, field: "external_user_id", type: DataTypes.STRING(255) },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    partnerId: {
      allowNull: false,
      field: "partner_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: { key: "id", model: "partners" },
      type: DataTypes.UUID
    },
    profileId: {
      allowNull: false,
      field: "profile_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    subjectType: {
      allowNull: false,
      field: "subject_type",
      type: DataTypes.ENUM(...MANAGED_PROFILE_SUBJECT_TYPES)
    },
    updatedAt: { allowNull: false, defaultValue: DataTypes.NOW, field: "updated_at", type: DataTypes.DATE }
  },
  {
    indexes: [
      {
        fields: ["partner_id", "external_user_id"],
        name: "uq_partner_managed_profiles_partner_external_user",
        unique: true
      },
      { fields: ["profile_id"], name: "uq_partner_managed_profiles_profile_id", unique: true }
    ],
    modelName: "PartnerManagedProfile",
    sequelize,
    tableName: "partner_managed_profiles",
    timestamps: true
  }
);

export default PartnerManagedProfile;
