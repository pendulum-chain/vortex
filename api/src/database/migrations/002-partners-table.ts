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
      unique: true,
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
  await queryInterface.addIndex('partners', ['name'], {
    name: 'idx_partners_name',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop the partners table
  await queryInterface.dropTable('partners');
}
