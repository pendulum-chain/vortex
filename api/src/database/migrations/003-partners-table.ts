import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Create partners table
  await queryInterface.createTable('partners', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'display_name',
    },
    logoUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'logo_url',
    },
    markupType: {
      type: DataTypes.ENUM('absolute', 'relative', 'none'),
      allowNull: false,
      field: 'markup_type',
      defaultValue: 'none',
    },
    markupValue: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      field: 'markup_value',
      defaultValue: 0,
    },
    markupCurrency: {
      type: DataTypes.STRING(8),
      allowNull: true,
      field: 'markup_currency',
    },
    payoutAddress: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'payout_address',
    },
    rampType: {
      type: DataTypes.ENUM('on', 'off'),
      allowNull: false,
      field: 'ramp_type',
      defaultValue: 'on',
    },
    vortexFeeType: {
      type: DataTypes.ENUM('absolute', 'relative', 'none'),
      allowNull: false,
      field: 'vortex_fee_type',
      defaultValue: 'none',
    },
    vortexFeeValue: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      field: 'vortex_fee_value',
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      field: 'is_active',
      defaultValue: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW,
    },
  });

  // Add composite index for faster lookups
  await queryInterface.addIndex('partners', ['name', 'ramp_type'], {
    name: 'idx_partners_name_ramp_type',
  });

  // Insert Vortex as a partner
  await queryInterface.bulkInsert('partners', [
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      name: 'vortex',
      display_name: 'Vortex',
      markup_type: 'relative',
      markup_value: 0.0001, // 0.01% (represented as decimal)
      markup_currency: 'USDC',
      payout_address: '6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy',
      ramp_type: 'on',
      vortex_fee_type: 'none',
      vortex_fee_value: 0,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      name: 'vortex',
      display_name: 'Vortex',
      markup_type: 'relative',
      markup_value: 0.0001, // 0.01% (represented as decimal)
      markup_currency: 'USDC',
      payout_address: '6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy',
      ramp_type: 'off',
      vortex_fee_type: 'none',
      vortex_fee_value: 0,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      name: 'n3mus_absolute',
      display_name: 'N3mus Absolute',
      markup_type: 'absolute',
      markup_value: 1.432, // $1.00 (represented as decimal)
      markup_currency: 'USDC',
      payout_address: '6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy',
      ramp_type: 'on',
      vortex_fee_type: 'relative',
      vortex_fee_value: 0.1, // 0.1% (represented as decimal)
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      name: 'n3mus_relative',
      display_name: 'N3mus relative',
      markup_type: 'relative',
      markup_value: 0.1,
      markup_currency: 'USDC',
      payout_address: '6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy',
      ramp_type: 'on',
      vortex_fee_type: 'relative',
      vortex_fee_value: 0.2,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      name: 'n3mus_absolute',
      display_name: 'N3mus Absolute',
      markup_type: 'absolute',
      markup_value: 1.0, // $1.00 (represented as decimal)
      markup_currency: 'USDC',
      payout_address: '6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy',
      ramp_type: 'off',
      vortex_fee_type: 'relative',
      vortex_fee_value: 0.1, // 0.1% (represented as decimal)
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      name: 'n3mus_relative',
      display_name: 'N3mus relative',
      markup_type: 'relative',
      markup_value: 0.01,
      markup_currency: 'USDC',
      payout_address: '6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy',
      ramp_type: 'off',
      vortex_fee_type: 'relative',
      vortex_fee_value: 0.2,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove the Vortex partner
  await queryInterface.bulkDelete('partners', { name: 'vortex' });

  // Remove the composite index
  await queryInterface.removeIndex('partners', 'idx_partners_name_ramp_type');

  // Drop the partners table if needed
  await queryInterface.dropTable('partners');
}
