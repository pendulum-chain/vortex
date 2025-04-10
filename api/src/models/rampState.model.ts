import { DataTypes, Model, Optional } from 'sequelize';
import { CleanupPhase, DestinationType, PresignedTx, RampErrorLog, RampPhase, UnsignedTx } from 'shared';
import sequelize from '../config/database';

export interface PhaseHistoryEntry {
  phase: RampPhase;
  timestamp: Date;
  metadata?: any;
}

type ProcessingLock = {
  locked: boolean;
  lockedAt: Date | null;
};

type CleanupError = {
  name: CleanupPhase;
  error: string;
};

type PostCompleteState = {
  cleanup: {
    cleanupCompleted: boolean;
    cleanupAt: Date | null;
    errors: CleanupError[] | null;
  };
};

// Define the attributes of the RampState model
export interface RampStateAttributes {
  id: string; // UUID
  type: 'on' | 'off';
  currentPhase: RampPhase;
  unsignedTxs: UnsignedTx[]; // JSONB array
  presignedTxs: PresignedTx[] | null; // JSONB array
  from: DestinationType;
  to: DestinationType;
  state: any; // JSONB
  quoteId: string; // UUID reference to QuoteTicket
  phaseHistory: PhaseHistoryEntry[]; // JSONB array
  errorLogs: RampErrorLog[]; // JSONB array
  processingLock: ProcessingLock;
  postCompleteState: PostCompleteState;
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
type RampStateCreationAttributes = Optional<RampStateAttributes, 'id' | 'createdAt' | 'updatedAt'>;

// Define the RampState model
class RampState extends Model<RampStateAttributes, RampStateCreationAttributes> implements RampStateAttributes {
  declare id: string;

  declare type: 'on' | 'off';

  declare currentPhase: RampPhase;

  declare unsignedTxs: UnsignedTx[];

  declare presignedTxs: PresignedTx[] | null;

  declare from: DestinationType;

  declare to: DestinationType;

  declare state: any;

  declare quoteId: string;

  declare phaseHistory: PhaseHistoryEntry[];

  declare errorLogs: RampErrorLog[];

  declare processingLock: ProcessingLock;

  declare postCompleteState: PostCompleteState;

  declare createdAt: Date;

  declare updatedAt: Date;
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
        isValidTxArray(value: UnsignedTx[]) {
          if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
            throw new Error('unsignedTxs must be an array with 1-8 elements');
          }
        },
      },
    },
    presignedTxs: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'presigned_txs',
      validate: {
        isValidTxArray(value: PresignedTx[] | null) {
          if (value === null) return;

          if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
            throw new Error('presignedTxs must be an array with 1-8 elements');
          }

          for (const tx of value) {
            if (!tx.txData || !tx.phase || !tx.network || tx.nonce === undefined || !tx.signer) {
              throw new Error('Each transaction must have txData, phase, network, nonce, and signer properties');
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
    processingLock: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'processing_lock',
    },
    postCompleteState: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'post_complete_state',
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
