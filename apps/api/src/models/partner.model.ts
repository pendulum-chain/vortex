import { RampCurrency, RampDirection } from "@vortexfi/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Define the attributes of the Partner model
export interface PartnerAttributes {
  id: string; // UUID
  name: string;
  displayName: string;
  logoUrl: string | null;
  markupType: "absolute" | "relative" | "none";
  markupValue: number;
  markupCurrency: RampCurrency;
  payoutAddress: string;
  rampType: RampDirection;
  vortexFeeType: "absolute" | "relative" | "none";
  vortexFeeValue: number;
  discount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
type PartnerCreationAttributes = Optional<PartnerAttributes, "id" | "createdAt" | "updatedAt">;

// Define the Partner model
class Partner extends Model<PartnerAttributes, PartnerCreationAttributes> implements PartnerAttributes {
  declare id: string;

  declare name: string;

  declare displayName: string;

  declare logoUrl: string | null;

  declare markupType: "absolute" | "relative" | "none";

  declare markupValue: number;

  declare markupCurrency: RampCurrency;

  declare payoutAddress: string;

  declare rampType: RampDirection;

  declare vortexFeeType: "absolute" | "relative" | "none";

  declare vortexFeeValue: number;

  declare discount: number;

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
    discount: {
      allowNull: false,
      defaultValue: 0,
      field: "discount",
      type: DataTypes.DECIMAL(10, 4)
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
    markupCurrency: {
      allowNull: true,
      field: "markup_currency",
      type: DataTypes.STRING(8)
    },
    markupType: {
      allowNull: false,
      defaultValue: "none",
      field: "markup_type",
      type: DataTypes.ENUM("absolute", "relative", "none")
    },
    markupValue: {
      allowNull: false,
      defaultValue: 0,
      field: "markup_value",
      type: DataTypes.DECIMAL(10, 4)
    },
    name: {
      allowNull: false,
      type: DataTypes.STRING(100)
    },
    payoutAddress: {
      allowNull: true,
      field: "payout_address",
      type: DataTypes.STRING(255)
    },
    rampType: {
      allowNull: false,
      field: "ramp_type",
      type: DataTypes.ENUM(RampDirection.BUY, RampDirection.SELL)
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    vortexFeeType: {
      allowNull: false,
      defaultValue: "none",
      field: "vortex_fee_type",
      type: DataTypes.ENUM("absolute", "relative", "none")
    },
    vortexFeeValue: {
      allowNull: false,
      defaultValue: 0,
      field: "vortex_fee_value",
      type: DataTypes.DECIMAL(10, 4)
    }
  },
  {
    indexes: [
      {
        fields: ["name", "ramp_type"],
        name: "idx_partners_name_ramp_type"
      }
    ],
    modelName: "Partner",
    sequelize,
    tableName: "partners",
    timestamps: true
  }
);

export default Partner;
