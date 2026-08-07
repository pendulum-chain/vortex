import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type ManagedProfileStatus = "active" | "deleted";
export type ManagedProfileCreationSource = "manager" | "vortex";

export interface ManagedProfileAttributes {
  id: string;
  managerProfileId: string;
  profileId: string;
  externalSubjectId: string;
  contactEmail: string | null;
  status: ManagedProfileStatus;
  creationSource: ManagedProfileCreationSource;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

type ManagedProfileCreationAttributes = Optional<
  ManagedProfileAttributes,
  "id" | "status" | "createdAt" | "updatedAt" | "deletedAt" | "contactEmail"
>;

class ManagedProfile
  extends Model<ManagedProfileAttributes, ManagedProfileCreationAttributes>
  implements ManagedProfileAttributes
{
  declare id: string;
  declare managerProfileId: string;
  declare profileId: string;
  declare externalSubjectId: string;
  declare contactEmail: string | null;
  declare status: ManagedProfileStatus;
  declare creationSource: ManagedProfileCreationSource;
  declare createdAt: Date;
  declare updatedAt: Date;
  declare deletedAt: Date | null;
}

ManagedProfile.init(
  {
    contactEmail: {
      allowNull: true,
      field: "contact_email",
      type: DataTypes.STRING(255)
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    creationSource: {
      allowNull: false,
      field: "creation_source",
      type: DataTypes.STRING(20)
    },
    deletedAt: {
      allowNull: true,
      field: "deleted_at",
      type: DataTypes.DATE
    },
    externalSubjectId: {
      allowNull: false,
      field: "external_subject_id",
      type: DataTypes.STRING(255)
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    managerProfileId: {
      allowNull: false,
      field: "manager_profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "profile_id", model: "managed_profile_managers" },
      type: DataTypes.UUID
    },
    profileId: {
      allowNull: false,
      field: "profile_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    status: {
      allowNull: false,
      defaultValue: "active",
      type: DataTypes.STRING(20)
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
      { fields: ["profile_id"], name: "uq_managed_profiles_profile_id", unique: true },
      {
        fields: ["manager_profile_id", "external_subject_id"],
        name: "uq_managed_profiles_manager_external_subject",
        unique: true
      },
      {
        fields: ["manager_profile_id", "contact_email"],
        name: "uq_managed_profiles_manager_contact_email",
        unique: true
      }
    ],
    modelName: "ManagedProfile",
    sequelize,
    tableName: "managed_profiles",
    timestamps: true
  }
);

export default ManagedProfile;
