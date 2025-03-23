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

  // Create ramp_states table
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
      allowNull: false,
      field: 'presigned_txs',
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
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
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

  // Create idempotency_keys table
  await queryInterface.createTable('idempotency_keys', {
    key: {
      type: DataTypes.STRING(36),
      primaryKey: true,
    },
    rampId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'ramp_id',
      references: {
        model: 'ramp_states',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    responseStatus: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      field: 'response_status',
    },
    responseBody: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'response_body',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
    },
    expiredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expired_at',
    },
  });

  // Create indexes
  await queryInterface.addIndex('quote_tickets', ['chain_id', 'expires_at'], {
    name: 'idx_quote_chain_expiry',
    where: {
      status: 'pending',
    },
  });

  await queryInterface.addIndex('ramp_states', ['current_phase'], {
    name: 'idx_ramp_phase_status',
  });

  await queryInterface.addIndex('ramp_states', ['quote_id'], {
    name: 'idx_ramp_quote',
  });

  await queryInterface.addIndex('idempotency_keys', ['expired_at'], {
    name: 'idx_idempotency_expiry',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop tables in reverse order
  await queryInterface.dropTable('idempotency_keys');
  await queryInterface.dropTable('ramp_states');
  await queryInterface.dropTable('quote_tickets');
}
