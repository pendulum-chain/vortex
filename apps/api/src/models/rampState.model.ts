import { CleanupPhase, DestinationType, PresignedTx, RampErrorLog, RampPhase, UnsignedTx } from "@packages/shared";
import { DataTypes, Model, Optional } from "sequelize";
import { StateMetadata } from "../api/services/phases/meta-state-types";
import sequelize from "../config/database";

export interface PhaseHistoryEntry {
  phase: RampPhase;
  timestamp: Date;
  metadata?: StateMetadata;
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
  type: "on" | "off";
  currentPhase: RampPhase;
  unsignedTxs: UnsignedTx[]; // JSONB array
  presignedTxs: PresignedTx[] | null; // JSONB array
  from: DestinationType;
  to: DestinationType;
  state: StateMetadata; // JSONB
  quoteId: string; // UUID reference to QuoteTicket
  phaseHistory: PhaseHistoryEntry[]; // JSONB array
  errorLogs: RampErrorLog[]; // JSONB array
  processingLock: ProcessingLock;
  postCompleteState: PostCompleteState;
  createdAt: Date;
  updatedAt: Date;
}

// Define the attributes that can be set during creation
export type RampStateCreationAttributes = Optional<RampStateAttributes, "id" | "createdAt" | "updatedAt">;

// Define the RampState model
class RampState extends Model<RampStateAttributes, RampStateCreationAttributes> implements RampStateAttributes {
  declare id: string;

  declare type: "on" | "off";

  declare currentPhase: RampPhase;

  declare unsignedTxs: UnsignedTx[];

  declare presignedTxs: PresignedTx[] | null;

  declare from: DestinationType;

  declare to: DestinationType;

  declare state: StateMetadata;

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
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    currentPhase: {
      allowNull: false,
      defaultValue: "initial",
      field: "current_phase",
      type: DataTypes.STRING(32)
    },
    errorLogs: {
      allowNull: false,
      defaultValue: [],
      field: "error_logs",
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
    phaseHistory: {
      allowNull: false,
      defaultValue: [],
      field: "phase_history",
      type: DataTypes.JSONB
    },
    postCompleteState: {
      allowNull: false,
      field: "post_complete_state",
      type: DataTypes.JSONB
    },
    presignedTxs: {
      allowNull: true,
      field: "presigned_txs",
      type: DataTypes.JSONB,
      validate: {
        isValidTxArray(value: PresignedTx[] | null) {
          if (value === null) return;

          if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
            throw new Error("presignedTxs must be an array with 1-8 elements");
          }

          for (const tx of value) {
            if (!tx.txData || !tx.phase || !tx.network || tx.nonce === undefined || !tx.signer) {
              throw new Error("Each transaction must have txData, phase, network, nonce, and signer properties");
            }
          }
        }
      }
    },
    processingLock: {
      allowNull: false,
      field: "processing_lock",
      type: DataTypes.JSONB
    },
    quoteId: {
      allowNull: false,
      field: "quote_id",
      references: {
        key: "id",
        model: "quote_tickets"
      },
      type: DataTypes.UUID
    },
    state: {
      allowNull: false,
      type: DataTypes.JSONB
    },
    to: {
      allowNull: false,
      type: DataTypes.STRING(20)
    },
    type: {
      allowNull: false,
      type: DataTypes.ENUM("on", "off")
    },
    unsignedTxs: {
      allowNull: false,
      field: "unsigned_txs",
      type: DataTypes.JSONB,
      validate: {
        isValidTxArray(value: UnsignedTx[]) {
          if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
            throw new Error("unsignedTxs must be an array with 1-8 elements");
          }
        }
      }
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
        fields: ["currentPhase"],
        name: "idx_ramp_phase_status"
      },
      {
        fields: ["quoteId"],
        name: "idx_ramp_quote"
      }
    ],
    modelName: "RampState",
    sequelize,
    tableName: "ramp_states",
    timestamps: true
  }
);

export default RampState;
