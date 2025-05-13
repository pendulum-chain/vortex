import { QueryInterface, DataTypes, Op } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Create anchors table
  await queryInterface.createTable('anchors', {
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
    identifier: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Optional context, e.g., network name, anchor name, or "default"',
    },
    valueType: {
      type: DataTypes.ENUM('absolute', 'relative'),
      allowNull: false,
      field: 'value_type',
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
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
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
  });

  // Add index for faster lookups
  await queryInterface.addIndex('anchors', ['ramp_type', 'identifier', 'is_active'], {
    name: 'idx_anchors_lookup',
  });

  // Insert initial data for fees
  await queryInterface.bulkInsert('anchors', [
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      ramp_type: 'on',
      identifier: 'moonbeam_brla',
      value_type: 'absolute',
      value: 0.75, // 0.75 BRL
      currency: 'BRL',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      ramp_type: 'off',
      identifier: 'moonbeam_brla',
      value_type: 'absolute',
      value: 0.75, // 0.75 BRL
      currency: 'BRL',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      ramp_type: 'off',
      identifier: 'stellar_eurc',
      value_type: 'relative',
      value: 0.0025, // 0.25% (represented as decimal)
      currency: 'EUR',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      ramp_type: 'off',
      identifier: 'stellar_ars',
      value_type: 'relative',
      value: 0.02, // 2% (represented as decimal)
      currency: 'ARS',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      ramp_type: 'off',
      identifier: 'stellar_ars',
      value_type: 'absolute',
      value: 10.0, // 10 ARS
      currency: 'ARS',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove the initial data
  await queryInterface.bulkDelete('anchors', {
    identifier: {
      [Op.in]: ['moonbeam_brla', 'stellar_eurc', 'stellar_ars'],
    },
  });

  // Remove the index
  await queryInterface.removeIndex('anchors', 'idx_anchors_lookup');

  // Drop the anchors table
  await queryInterface.dropTable('anchors');

  // Explicitly drop the ENUM type
  // Note: The name of the enum type might be schema-qualified in some setups,
  // but 'enum_anchors_fee_type' is what the error message indicates.
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_anchors_fee_type";');
}
