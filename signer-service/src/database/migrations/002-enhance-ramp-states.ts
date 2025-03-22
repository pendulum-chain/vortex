import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Add new columns to ramp_states table
  await queryInterface.addColumn('ramp_states', 'phase_history', {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    field: 'phase_history',
  });

  await queryInterface.addColumn('ramp_states', 'error_logs', {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    field: 'error_logs',
  });

  await queryInterface.addColumn('ramp_states', 'subsidy_details', {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'subsidy_details',
  });

  await queryInterface.addColumn('ramp_states', 'nonce_sequences', {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'nonce_sequences',
  });

  // Create phase_metadata table
  await queryInterface.createTable('phase_metadata', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    phase_name: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    required_transactions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    success_conditions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    retry_policy: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        max_attempts: 3,
        backoff_ms: 1000,
      },
    },
    valid_transitions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW,
    },
  });

  // Create indexes
  await queryInterface.addIndex('ramp_states', ['current_phase'], {
    name: 'idx_ramp_current_phase',
  });

  await queryInterface.addIndex('phase_metadata', ['phase_name'], {
    name: 'idx_phase_metadata_name',
  });

  await queryInterface.addIndex('phase_metadata', ['valid_transitions'], {
    name: 'idx_phase_metadata_transitions',
    using: 'gin',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop indexes
  await queryInterface.removeIndex('phase_metadata', 'idx_phase_metadata_transitions');
  await queryInterface.removeIndex('phase_metadata', 'idx_phase_metadata_name');
  await queryInterface.removeIndex('ramp_states', 'idx_ramp_current_phase');

  // Drop phase_metadata table
  await queryInterface.dropTable('phase_metadata');

  // Remove columns from ramp_states
  await queryInterface.removeColumn('ramp_states', 'nonce_sequences');
  await queryInterface.removeColumn('ramp_states', 'subsidy_details');
  await queryInterface.removeColumn('ramp_states', 'error_logs');
  await queryInterface.removeColumn('ramp_states', 'phase_history');
}
