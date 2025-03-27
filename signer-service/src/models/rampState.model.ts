import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';
import { DestinationType } from '../api/helpers/networks';

// Define the attributes of the RampState model
interface RampStateAttributes {
  id: string; // UUID
  type: 'on' | 'off';
  currentPhase: string;
  unsignedTxs: any[]; // JSONB array
  presignedTxs: any[] | undefined | null; // JSONB array
  from: DestinationType;
  to: DestinationType;
  state: any; // JSONB
  quoteId: string; // UUID reference to QuoteTicket
  phaseHistory: { phase: string; timestamp: Date; metadata?: any }[]; // JSONB array
  errorLogs: { phase: string; timestamp: Date; error: string; details?: any }[]; // JSONB array
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
  public unsignedTxs!: any[];
  public presignedTxs!: any[] | undefined | null;
  public from!: DestinationType;
  public to!: DestinationType;
  public state!: any;
  public quoteId!: string;
  public phaseHistory!: { phase: string; timestamp: Date; metadata?: any }[];
  public errorLogs!: { phase: string; timestamp: Date; error: string; details?: any }[];
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
    unsignedTxs: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'unsigned_txs',
      validate: {
        isValidTxArray(value: any[]) {
          if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
            throw new Error('unsignedTxs must be an array with 1-5 elements');
          }

          // for (const tx of value) {
          //   if (!tx.tx_data || !tx.phase || !tx.network || !tx.nonce || !tx.signer) {
          //     console.log("faulty,,,", tx);
          //     throw new Error('Each transaction must have tx_data, phase, network, nonce, and signer properties');
          //   }
          // }
        },
      },
    },
    presignedTxs: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'presigned_txs',
      validate: {
        isValidTxArray(value: any[] | null) {
          if (value === null) return;

          if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
            throw new Error('presignedTxs must be an array with 1-5 elements');
          }

          for (const tx of value) {
            if (!tx.tx_data || !tx.phase || !tx.network || !tx.nonce || !tx.signer || !tx.signature) {
              throw new Error(
                'Each transaction must have tx_data, phase, network, nonce, signer, and signature properties',
              );
            }
          }
        },
      },
    },
    from: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    to: {
      type: DataTypes.STRING(20),
      allowNull: false,
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
