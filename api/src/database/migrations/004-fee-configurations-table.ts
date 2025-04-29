import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Create fee_configurations table
  await queryInterface.createTable('fee_configurations', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fee_type: {
      type: DataTypes.ENUM('vortex_foundation', 'anchor_base', 'network_estimate'),
      allowNull: false,
    },
    identifier: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Optional context, e.g., network name, anchor name, or "default"',
    },
    value_type: {
      type: DataTypes.ENUM('absolute', 'relative'),
      allowNull: false,
    },
    value: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'USD',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  // Add index for faster lookups
  await queryInterface.addIndex('fee_configurations', ['fee_type', 'identifier', 'is_active'], {
    name: 'idx_fee_configurations_lookup',
  });

  // Insert initial data for network fee (static 0 USD)
  await queryInterface.bulkInsert('fee_configurations', [
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      fee_type: 'network_estimate',
      identifier: 'default',
      value_type: 'absolute',
      value: 0,
      currency: 'USD',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      fee_type: 'vortex_foundation',
      identifier: 'default',
      value_type: 'relative',
      value: 0.10, // 0.1%
      currency: 'USD',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      fee_type: 'anchor_base',
      identifier: 'moonbeam_brla',
      value_type: 'absolute',
      value: 0.50, // $0.50
      currency: 'USD',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop the fee_configurations table
  await queryInterface.dropTable('fee_configurations');
}
