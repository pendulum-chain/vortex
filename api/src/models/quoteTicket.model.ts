import { DataTypes, Model, Optional } from 'sequelize';
import { DestinationType, RampCurrency } from 'shared';
import sequelize from '../config/database';
import Partner from './partner.model';

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
  networkFee: string;
  processingFee: string;
  partnerMarkupFee: string;
  totalFee: string;
  feeCurrency: string;
  partnerId: string | null;
  expiresAt: Date;
  status: 'pending' | 'consumed' | 'expired';
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteTicketMetadata {
  onrampOutputAmountMoonbeamRaw: string;
  onrampInputAmountUnits: string;
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

  declare networkFee: string;

  declare processingFee: string;

  declare partnerMarkupFee: string;

  declare totalFee: string;

  declare feeCurrency: string;

  declare partnerId: string | null;

  declare expiresAt: Date;

  declare status: 'pending' | 'consumed' | 'expired';

  declare metadata: string;

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
    networkFee: {
      type: DataTypes.DECIMAL(38, 18),
      allowNull: false,
      field: 'network_fee',
    },
    processingFee: {
      type: DataTypes.DECIMAL(38, 18),
      allowNull: false,
      field: 'processing_fee',
    },
    partnerMarkupFee: {
      type: DataTypes.DECIMAL(38, 18),
      allowNull: false,
      defaultValue: 0,
      field: 'partner_markup_fee',
    },
    totalFee: {
      type: DataTypes.DECIMAL(38, 18),
      allowNull: false,
      field: 'total_fee',
    },
    feeCurrency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'USD',
      field: 'fee_currency',
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

// Define association with Partner
QuoteTicket.belongsTo(Partner, { foreignKey: 'partner_id', as: 'partner' });

export default QuoteTicket;
