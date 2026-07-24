import { FiatToken, RampCurrency, RampDirection } from "@vortexfi/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Per-direction pricing for a partner, split out of the partners table (which keeps only the
// commercial identity under a unique name). Resolved by (partner_id, ramp_type, fiat_currency):
// a NULL fiat_currency is the wildcard row for every corridor; a scoped row wins over it.
export interface PartnerPricingConfigAttributes {
  id: string;
  partnerId: string;
  rampType: RampDirection;
  fiatCurrency: FiatToken | null;
  markupType: "absolute" | "relative" | "none";
  markupValue: number;
  markupCurrency: RampCurrency | null;
  vortexFeeType: "absolute" | "relative" | "none";
  vortexFeeValue: number;
  targetDiscount: number;
  maxSubsidy: number;
  minDynamicDifference: number;
  maxDynamicDifference: number;
  payoutAddressSubstrate: string | null;
  payoutAddressEvm: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type PartnerPricingConfigCreationAttributes = Optional<
  PartnerPricingConfigAttributes,
  | "id"
  | "fiatCurrency"
  | "markupType"
  | "markupValue"
  | "markupCurrency"
  | "vortexFeeType"
  | "vortexFeeValue"
  | "targetDiscount"
  | "maxSubsidy"
  | "minDynamicDifference"
  | "maxDynamicDifference"
  | "payoutAddressSubstrate"
  | "payoutAddressEvm"
  | "isActive"
  | "createdAt"
  | "updatedAt"
>;

class PartnerPricingConfig
  extends Model<PartnerPricingConfigAttributes, PartnerPricingConfigCreationAttributes>
  implements PartnerPricingConfigAttributes
{
  declare id: string;
  declare partnerId: string;
  declare rampType: RampDirection;
  declare fiatCurrency: FiatToken | null;
  declare markupType: "absolute" | "relative" | "none";
  declare markupValue: number;
  declare markupCurrency: RampCurrency | null;
  declare vortexFeeType: "absolute" | "relative" | "none";
  declare vortexFeeValue: number;
  declare targetDiscount: number;
  declare maxSubsidy: number;
  declare minDynamicDifference: number;
  declare maxDynamicDifference: number;
  declare payoutAddressSubstrate: string | null;
  declare payoutAddressEvm: string | null;
  declare isActive: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

PartnerPricingConfig.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    fiatCurrency: {
      allowNull: true,
      defaultValue: null,
      field: "fiat_currency",
      type: DataTypes.STRING(8)
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
    markupCurrency: {
      allowNull: true,
      field: "markup_currency",
      type: DataTypes.STRING(30)
    },
    markupType: {
      allowNull: false,
      defaultValue: "none",
      field: "markup_type",
      type: DataTypes.STRING(16)
    },
    markupValue: {
      allowNull: false,
      defaultValue: 0,
      field: "markup_value",
      type: DataTypes.DECIMAL(10, 4)
    },
    maxDynamicDifference: {
      allowNull: false,
      defaultValue: 0,
      field: "max_dynamic_difference",
      type: DataTypes.DECIMAL(10, 4)
    },
    maxSubsidy: {
      allowNull: false,
      defaultValue: 0,
      field: "max_subsidy",
      type: DataTypes.DECIMAL(10, 4)
    },
    minDynamicDifference: {
      allowNull: false,
      defaultValue: 0,
      field: "min_dynamic_difference",
      type: DataTypes.DECIMAL(10, 4)
    },
    partnerId: {
      allowNull: false,
      field: "partner_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "partners"
      },
      type: DataTypes.UUID
    },
    payoutAddressEvm: {
      allowNull: true,
      field: "payout_address_evm",
      type: DataTypes.STRING(255)
    },
    payoutAddressSubstrate: {
      allowNull: true,
      field: "payout_address_substrate",
      type: DataTypes.STRING(255)
    },
    rampType: {
      allowNull: false,
      field: "ramp_type",
      type: DataTypes.STRING(8)
    },
    targetDiscount: {
      allowNull: false,
      defaultValue: 0,
      field: "target_discount",
      type: DataTypes.DECIMAL(10, 4)
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
      type: DataTypes.STRING(16)
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
        // The real index (migration 051) is on (partner_id, ramp_type, COALESCE(fiat_currency, '*'))
        // so NULL wildcard rows are unique too; migrations are the schema source of truth.
        fields: ["partner_id", "ramp_type", "fiat_currency"],
        name: "uniq_partner_pricing_configs_partner_ramp_fiat",
        unique: true
      }
    ],
    modelName: "PartnerPricingConfig",
    sequelize,
    tableName: "partner_pricing_configs",
    timestamps: true
  }
);

export default PartnerPricingConfig;
