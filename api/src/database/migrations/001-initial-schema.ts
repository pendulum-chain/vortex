import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Create quote_tickets table
  await queryInterface.createTable('quote_tickets', {
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
      type: DataTypes.DECIMAL(38, 18),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
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
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
    },
  });

  // Create ramp_states table with all columns (including those from the second migration)
  await queryInterface.createTable('ramp_states', {
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
    },
    presignedTxs: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'presigned_txs',
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
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    // Additional columns from the second migration
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
      allowNull: false,
      defaultValue: { locked: false, lockedAt: null },
      field: 'processing_lock',
    },
    postCompleteState: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        cleanup: {
          cleanupCompleted: false,
          cleanupAt: null,
          error: null,
        },
      },
      field: 'post_complete_state',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
    },
  });

  // Create all indexes
  // From first migration
  await queryInterface.addIndex('quote_tickets', ['from', 'to', 'expires_at'], {
    name: 'idx_quote_chain_expiry',
    where: {
      status: 'pending',
    },
  });

  // Note: This index is replaced by the one from the second migration with the same name
  // but we'll keep it here for completeness
  await queryInterface.addIndex('ramp_states', ['current_phase'], {
    name: 'idx_ramp_current_phase', // Renamed to match the second migration
  });

  await queryInterface.addIndex('ramp_states', ['quote_id'], {
    name: 'idx_ramp_quote',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop all indexes
  await queryInterface.removeIndex('ramp_states', 'idx_ramp_current_phase');
  await queryInterface.removeIndex('ramp_states', 'idx_ramp_quote');
  await queryInterface.removeIndex('quote_tickets', 'idx_quote_chain_expiry');

  // Drop tables in reverse order
  await queryInterface.dropTable('ramp_states');
  await queryInterface.dropTable('quote_tickets');
}
