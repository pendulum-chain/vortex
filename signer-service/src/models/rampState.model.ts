import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

// Define the attributes of the RampState model
interface RampStateAttributes {
  id: string; // UUID
  type: 'on' | 'off';
  currentPhase: string;
  presignedTxs: any[]; // JSONB array
  chainId: number;
  state: any; // JSONB
  quoteId: string; // UUID reference to QuoteTicket
  phaseHistory: { phase: string; timestamp: Date; metadata?: any }[]; // JSONB array
  errorLogs: { phase: string; timestamp: Date; error: string; details?: any }[]; // JSONB array
  subsidyDetails: {
    hardLimit?: string;
    softLimit?: string;
    consumed?: string;
    remaining?: string;
  }; // JSONB
  nonceSequences: Record<string, number>; // JSONB
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
interface RampStateCreationAttributes extends Optional<RampStateAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

// Define the RampState model
class RampState extends Model<RampStateAttributes, RampStateCreationAttributes> implements RampStateAttributes {
  public id!: string;
  public type!: 'on' | 'off';
  public currentPhase!: string;
  public presignedTxs!: any[];
  public chainId!: number;
  public state!: any;
  public quoteId!: string;
  public phaseHistory!: { phase: string; timestamp: Date; metadata?: any }[];
  public errorLogs!: { phase: string; timestamp: Date; error: string; details?: any }[];
  public subsidyDetails!: {
    hardLimit?: string;
    softLimit?: string;
    consumed?: string;
    remaining?: string;
  };
  public nonceSequences!: Record<string, number>;
  public createdAt!: Date;
  public updatedAt!: Date;
}

// Initialize the model
RampState.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM('on', 'off'),
      allowNull: false,
    },
    currentPhase: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'initial',
      field: 'current_phase',
    },
    presignedTxs: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'presigned_txs',
      validate: {
        isValidTxArray(value: any[]) {
          if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
            throw new Error('presignedTxs must be an array with 1-5 elements');
          }

          for (const tx of value) {
            if (!tx.tx_data || !tx.expires_at || !tx.phase) {
              throw new Error('Each transaction must have tx_data, expires_at, and phase properties');
            }
          }
        },
      },
    },
    chainId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'chain_id',
    },
    state: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    quoteId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'quote_id',
      references: {
        model: 'quote_tickets',
        key: 'id',
      },
    },
    phaseHistory: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'phase_history',
    },
    errorLogs: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'error_logs',
    },
    subsidyDetails: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'subsidy_details',
    },
    nonceSequences: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'nonce_sequences',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    modelName: 'RampState',
    tableName: 'ramp_states',
    timestamps: true,
    indexes: [
      {
        name: 'idx_ramp_phase_status',
        fields: ['currentPhase'],
      },
      {
        name: 'idx_ramp_quote',
        fields: ['quoteId'],
      },
    ],
  },
);

export default RampState;
