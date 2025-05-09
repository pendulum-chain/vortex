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
    display_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    logo_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    markup_type: {
      type: DataTypes.ENUM('absolute', 'relative', 'none'),
      allowNull: false,
      defaultValue: 'none',
    },
    markup_value: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
    },
    markup_currency: {
      type: DataTypes.STRING(8),
      allowNull: true,
    },
    payout_address: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    fee_type: {
      type: DataTypes.ENUM('on', 'off'),
      allowNull: false,
      defaultValue: 'on',
    },
    vortex_fee_type: {
      type: DataTypes.ENUM('absolute', 'relative', 'none'),
      allowNull: false,
      defaultValue: 'none',
    },
    vortex_fee_value: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
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

  // Add composite index for faster lookups
  await queryInterface.addIndex('partners', ['name', 'fee_type'], {
    name: 'idx_partners_name_fee_type',
  });

  // Insert Vortex as a partner
  await queryInterface.bulkInsert('partners', [
    {
      id: queryInterface.sequelize.literal('uuid_generate_v4()'),
      name: 'vortex',
      display_name: 'Vortex',
      markup_type: 'relative',
      markup_value: 0.0001, // 0.01% (represented as decimal)
      markup_currency: 'USD',
      payout_address: '6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy',
      fee_type: 'on',
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
      markup_currency: 'USD',
      payout_address: '6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy',
      fee_type: 'off',
      vortex_fee_type: 'none',
      vortex_fee_value: 0,
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
  await queryInterface.removeIndex('partners', 'idx_partners_name_fee_type');

  // Drop the partners table if needed
  await queryInterface.dropTable('partners');
}
