import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

// Define the attributes of the QuoteTicket model
interface QuoteTicketAttributes {
  id: string; // UUID
  rampType: 'on' | 'off';
  chainId: number;
  inputAmount: string;
  inputCurrency: string;
  outputAmount: string;
  outputCurrency: string;
  fee: string;
  expiresAt: Date;
  status: 'pending' | 'consumed' | 'expired';
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
interface QuoteTicketCreationAttributes extends Optional<QuoteTicketAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

// Define the QuoteTicket model
class QuoteTicket extends Model<QuoteTicketAttributes, QuoteTicketCreationAttributes> implements QuoteTicketAttributes {
  public id!: string;
  public rampType!: 'on' | 'off';
  public chainId!: number;
  public inputAmount!: string;
  public inputCurrency!: string;
  public outputAmount!: string;
  public outputCurrency!: string;
  public fee!: string;
  public expiresAt!: Date;
  public status!: 'pending' | 'consumed' | 'expired';
  public createdAt!: Date;
  public updatedAt!: Date;
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
    chainId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'chain_id',
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
        fields: ['chainId', 'expiresAt'],
        where: {
          status: 'pending',
        },
      },
    ],
  },
);

export default QuoteTicket;
