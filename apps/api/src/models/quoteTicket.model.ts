import { DestinationType, QuoteFeeStructure, RampCurrency, RampDirection } from "@packages/shared";
import { DataTypes, Model, Optional } from "sequelize";
import { QuoteContext } from "../api/services/ramp/quote.service/types";
import sequelize from "../config/database";

// Define the attributes of the QuoteTicket model
export interface QuoteTicketAttributes {
  id: string; // UUID
  rampType: RampDirection;
  from: DestinationType;
  to: DestinationType;
  inputAmount: string;
  inputCurrency: RampCurrency;
  outputAmount: string;
  outputCurrency: RampCurrency;
  fee: QuoteFeeStructure;
  partnerId: string | null;
  expiresAt: Date;
  status: "pending" | "consumed" | "expired";
  metadata: QuoteTicketMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteTicketMetadata {
  context: QuoteContext;
  // The input amount to be used for the nabla swap transaction.
  inputAmountForNablaSwapDecimal: string;
  onrampOutputAmountMoonbeamRaw: string;
  offrampAmountBeforeAnchorFees?: string;
  // We have the fee structure in the metadata for easy access when creating the transactions to distribute fees in USD-like
  // stablecoins. This is the same as the fee structure in the quote ticket but in USD instead of the target output currency.
  usdFeeStructure: QuoteFeeStructure;
  subsidy?: {
    partnerId: string;
    discount: string;
    subsidyAmountInOutputToken: string;
  };
}

// Define the attributes that can be set during creation
export type QuoteTicketCreationAttributes = Optional<QuoteTicketAttributes, "id" | "createdAt" | "updatedAt">;

// Define the QuoteTicket model
class QuoteTicket extends Model<QuoteTicketAttributes, QuoteTicketCreationAttributes> implements QuoteTicketAttributes {
  declare id: string;

  declare rampType: RampDirection;

  declare from: DestinationType;

  declare to: DestinationType;

  declare inputAmount: string;

  declare inputCurrency: RampCurrency;

  declare outputAmount: string;

  declare outputCurrency: RampCurrency;

  declare fee: QuoteFeeStructure;

  declare partnerId: string | null;

  declare expiresAt: Date;

  declare status: "pending" | "consumed" | "expired";

  declare metadata: QuoteTicketMetadata;

  declare createdAt: Date;

  declare updatedAt: Date;
}

// Initialize the model
QuoteTicket.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    expiresAt: {
      allowNull: false,
      defaultValue: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      field: "expires_at",
      type: DataTypes.DATE
    },
    fee: {
      allowNull: false,
      type: DataTypes.JSONB
    },
    from: {
      allowNull: false,
      type: DataTypes.STRING(20)
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    inputAmount: {
      allowNull: false,
      field: "input_amount",
      type: DataTypes.DECIMAL(38, 18)
    },
    inputCurrency: {
      allowNull: false,
      field: "input_currency",
      type: DataTypes.STRING(8)
    },
    metadata: {
      allowNull: false,
      type: DataTypes.JSONB
    },
    outputAmount: {
      allowNull: false,
      field: "output_amount",
      type: DataTypes.DECIMAL(38, 18)
    },
    outputCurrency: {
      allowNull: false,
      field: "output_currency",
      type: DataTypes.STRING(8)
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
    rampType: {
      allowNull: false,
      field: "ramp_type",
      type: DataTypes.ENUM(RampDirection.BUY, RampDirection.SELL)
    },
    status: {
      allowNull: false,
      defaultValue: "pending",
      type: DataTypes.ENUM("pending", "consumed", "expired")
    },
    to: {
      allowNull: false,
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
      {
        fields: ["from", "to", "expires_at"],
        name: "idx_quote_chain_expiry",
        where: {
          status: "pending"
        }
      },
      {
        fields: ["partner_id"],
        name: "idx_quote_tickets_partner"
      }
    ],
    modelName: "QuoteTicket",
    sequelize,
    tableName: "quote_tickets",
    timestamps: true
  }
);

export default QuoteTicket;
