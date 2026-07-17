import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Commercial identity only — one row per partner, unique name. Pricing lives in
// partner_pricing_configs (per ramp direction), resolved via (partner_id, ramp_type).
// The legacy pricing/ramp_type columns still exist in the DB as unread backup.
export interface PartnerAttributes {
  id: string; // UUID
  name: string;
  displayName: string;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
type PartnerCreationAttributes = Optional<PartnerAttributes, "id" | "logoUrl" | "isActive" | "createdAt" | "updatedAt">;

// Define the Partner model
class Partner extends Model<PartnerAttributes, PartnerCreationAttributes> implements PartnerAttributes {
  declare id: string;

  declare name: string;

  declare displayName: string;

  declare logoUrl: string | null;

  declare isActive: boolean;

  declare createdAt: Date;

  declare updatedAt: Date;
}

// Initialize the model
Partner.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    displayName: {
      allowNull: false,
      field: "display_name",
      type: DataTypes.STRING(100)
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
    logoUrl: {
      allowNull: true,
      field: "logo_url",
      type: DataTypes.STRING(255)
    },
    name: {
      allowNull: false,
      type: DataTypes.STRING(100),
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
    indexes: [
      {
        fields: ["name"],
        name: "uniq_partners_name",
        unique: true
      }
    ],
    modelName: "Partner",
    sequelize,
    tableName: "partners",
    timestamps: true
  }
);

export default Partner;
