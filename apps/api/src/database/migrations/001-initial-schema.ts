import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Create quote_tickets table
  await queryInterface.createTable("quote_tickets", {
    createdAt: {
      allowNull: false,
      field: "created_at",
      type: DataTypes.DATE
    },
    expiresAt: {
      allowNull: false,
      field: "expires_at",
      type: DataTypes.DATE
    },
    fee: {
      allowNull: false,
      type: DataTypes.DECIMAL(38, 18)
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
    rampType: {
      allowNull: false,
      field: "ramp_type",
      type: DataTypes.ENUM("on", "off")
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
      field: "updated_at",
      type: DataTypes.DATE
    }
  });

  // Create ramp_states table with all columns (including those from the second migration)
  await queryInterface.createTable("ramp_states", {
    createdAt: {
      allowNull: false,
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
      defaultValue: {
        cleanup: {
          cleanupAt: null,
          cleanupCompleted: false,
          error: null
        }
      },
      field: "post_complete_state",
      type: DataTypes.JSONB
    },
    presignedTxs: {
      allowNull: true,
      field: "presigned_txs",
      type: DataTypes.JSONB
    },
    processingLock: {
      allowNull: false,
      defaultValue: { locked: false, lockedAt: null },
      field: "processing_lock",
      type: DataTypes.JSONB
    },
    quoteId: {
      allowNull: false,
      field: "quote_id",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
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
      type: DataTypes.JSONB
    },
    updatedAt: {
      allowNull: false,
      field: "updated_at",
      type: DataTypes.DATE
    }
  });

  // Create all indexes
  // From first migration
  await queryInterface.addIndex("quote_tickets", ["from", "to", "expires_at"], {
    name: "idx_quote_chain_expiry",
    where: {
      status: "pending"
    }
  });

  // Note: This index is replaced by the one from the second migration with the same name
  // but we'll keep it here for completeness
  await queryInterface.addIndex("ramp_states", ["current_phase"], {
    name: "idx_ramp_current_phase" // Renamed to match the second migration
  });

  await queryInterface.addIndex("ramp_states", ["quote_id"], {
    name: "idx_ramp_quote"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop all indexes
  await queryInterface.removeIndex("ramp_states", "idx_ramp_current_phase");
  await queryInterface.removeIndex("ramp_states", "idx_ramp_quote");
  await queryInterface.removeIndex("quote_tickets", "idx_quote_chain_expiry");

  // Drop tables in reverse order
  await queryInterface.dropTable("ramp_states");
  await queryInterface.dropTable("quote_tickets");
}
