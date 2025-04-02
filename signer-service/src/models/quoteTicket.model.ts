import { DataTypes, Model, Optional } from 'sequelize';
import { DestinationType, RampCurrency } from 'shared';
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
  fee: string;
  expiresAt: Date;
  status: 'pending' | 'consumed' | 'expired';
  createdAt: Date;
  updatedAt: Date;
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

  declare fee: string;

  declare expiresAt: Date;

  declare status: 'pending' | 'consumed' | 'expired';

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
    fee: {
      type: DataTypes.DECIMAL(38, 18),
      allowNull: false,
    },
    outputCurrency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      field: 'output_currency',
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
        fields: ['from', 'to', 'expiresAt'],
        where: {
          status: 'pending',
        },
      },
    ],
  },
);

export default QuoteTicket;
