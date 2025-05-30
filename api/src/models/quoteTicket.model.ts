import { DataTypes, Model, Optional } from 'sequelize';
import { DestinationType, QuoteEndpoints, RampCurrency } from 'shared';
import sequelize from '../config/database';

// Define the attributes of the QuoteTicket model
export interface QuoteTicketAttributes {
  id: string; // UUID
  rampType: 'on' | 'off';
  from: DestinationType;
  to: DestinationType;
  inputAmount: string;
  inputCurrency: RampCurrency;
  outputAmount: string;
  outputCurrency: RampCurrency;
  fee: QuoteEndpoints.FeeStructure;
  partnerId: string | null;
  expiresAt: Date;
  status: 'pending' | 'consumed' | 'expired';
  metadata: QuoteTicketMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteTicketMetadata {
  onrampOutputAmountMoonbeamRaw: string;
  offrampAmountBeforeAnchorFees?: string;
  // We have the fee structure in the metadata for easy access when creating the transactions to distribute fees in USD-like
  // stablecoins. This is the same as the fee structure in the quote ticket but in USD instead of the target output currency.
  usdFeeStructure: QuoteEndpoints.FeeStructure;
}

// Define the attributes that can be set during creation
type QuoteTicketCreationAttributes = Optional<QuoteTicketAttributes, 'id' | 'createdAt' | 'updatedAt'>;

// Define the QuoteTicket model
class QuoteTicket extends Model<QuoteTicketAttributes, QuoteTicketCreationAttributes> implements QuoteTicketAttributes {
  declare id: string;

  declare rampType: 'on' | 'off';

  declare from: DestinationType;

  declare to: DestinationType;

  declare inputAmount: string;

  declare inputCurrency: RampCurrency;

  declare outputAmount: string;

  declare outputCurrency: RampCurrency;

  declare fee: QuoteEndpoints.FeeStructure;

  declare partnerId: string | null;

  declare expiresAt: Date;

  declare status: 'pending' | 'consumed' | 'expired';

  declare metadata: QuoteTicketMetadata;

  declare createdAt: Date;

  declare updatedAt: Date;
}

// Initialize the model
QuoteTicket.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    rampType: {
      type: DataTypes.ENUM('on', 'off'),
      allowNull: false,
      field: 'ramp_type',
    },
    from: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    to: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    inputAmount: {
      type: DataTypes.DECIMAL(38, 18),
      allowNull: false,
      field: 'input_amount',
    },
    inputCurrency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      field: 'input_currency',
    },
    outputAmount: {
      type: DataTypes.DECIMAL(38, 18),
      allowNull: false,
      field: 'output_amount',
    },
    outputCurrency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      field: 'output_currency',
    },
    fee: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    partnerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'partner_id',
      references: {
        model: 'partners',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
      defaultValue: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
    },
    status: {
      type: DataTypes.ENUM('pending', 'consumed', 'expired'),
      allowNull: false,
      defaultValue: 'pending',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'QuoteTicket',
    tableName: 'quote_tickets',
    timestamps: true,
    indexes: [
      {
        name: 'idx_quote_chain_expiry',
        fields: ['from', 'to', 'expires_at'],
        where: {
          status: 'pending',
        },
      },
      {
        name: 'idx_quote_tickets_partner',
        fields: ['partner_id'],
      },
    ],
  },
);

export default QuoteTicket;
