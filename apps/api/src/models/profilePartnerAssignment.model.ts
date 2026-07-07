import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface ProfilePartnerAssignmentAttributes {
  id: string;
  userId: string;
  partnerName: string;
  /** Canonical partner FK — replaces the buy/sell pair (which were the two direction-rows of the same partner). */
  partnerId: string | null;
  /** Legacy backup column — unread after the partners split. */
  buyPartnerId: string | null;
  /** Legacy backup column — unread after the partners split. */
  sellPartnerId: string | null;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type ProfilePartnerAssignmentCreationAttributes = Optional<
  ProfilePartnerAssignmentAttributes,
  "id" | "createdAt" | "updatedAt" | "isActive" | "expiresAt" | "partnerId" | "buyPartnerId" | "sellPartnerId"
>;

class ProfilePartnerAssignment
  extends Model<ProfilePartnerAssignmentAttributes, ProfilePartnerAssignmentCreationAttributes>
  implements ProfilePartnerAssignmentAttributes
{
  declare id: string;

  declare userId: string;

  declare partnerName: string;

  declare partnerId: string | null;

  declare buyPartnerId: string | null;

  declare sellPartnerId: string | null;

  declare isActive: boolean;

  declare expiresAt: Date | null;

  declare createdAt: Date;

  declare updatedAt: Date;
}

ProfilePartnerAssignment.init(
  {
    buyPartnerId: {
      allowNull: true,
      field: "buy_partner_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "partners"
      },
      type: DataTypes.UUID
    },
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
    partnerId: {
      allowNull: true,
      field: "partner_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "partners"
      },
      type: DataTypes.UUID
    },
    partnerName: {
      allowNull: false,
      field: "partner_name",
      type: DataTypes.STRING(100)
    },
    sellPartnerId: {
      allowNull: true,
      field: "sell_partner_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "partners"
      },
      type: DataTypes.UUID
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
        fields: ["partner_id"],
        name: "idx_profile_partner_assignments_partner_id"
      },
      {
        fields: ["buy_partner_id"],
        name: "idx_profile_partner_assignments_buy_partner"
      },
      {
        fields: ["sell_partner_id"],
        name: "idx_profile_partner_assignments_sell_partner"
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
