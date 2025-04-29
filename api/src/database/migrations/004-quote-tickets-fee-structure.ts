import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Add new fee columns to quote_tickets table
  await queryInterface.addColumn('quote_tickets', 'network_fee', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: true, // Allow null initially for migration
  });

  await queryInterface.addColumn('quote_tickets', 'processing_fee', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: true, // Allow null initially for migration
  });

  await queryInterface.addColumn('quote_tickets', 'partner_markup_fee', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: true, // Allow null initially for migration
    defaultValue: 0,
  });

  await queryInterface.addColumn('quote_tickets', 'total_fee', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: true, // Allow null initially for migration
  });

  await queryInterface.addColumn('quote_tickets', 'fee_currency', {
    type: DataTypes.STRING(8),
    allowNull: true, // Allow null initially for migration
    defaultValue: 'USD',
  });

  await queryInterface.addColumn('quote_tickets', 'partner_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'partners',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  });

  // Migrate existing data: copy the current fee value to total_fee, network_fee, and processing_fee
  // In a real migration, you might want to calculate these values more precisely
  await queryInterface.sequelize.query(`
    UPDATE quote_tickets 
    SET 
      total_fee = fee,
      network_fee = 1.00,
      processing_fee = fee - 1.00,
      partner_markup_fee = 0,
      fee_currency = 'USD'
    WHERE fee IS NOT NULL
  `);

  // Make the new columns non-nullable now that they have values
  await queryInterface.changeColumn('quote_tickets', 'network_fee', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: false,
  });

  await queryInterface.changeColumn('quote_tickets', 'processing_fee', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: false,
  });

  await queryInterface.changeColumn('quote_tickets', 'partner_markup_fee', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: false,
    defaultValue: 0,
  });

  await queryInterface.changeColumn('quote_tickets', 'total_fee', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: false,
  });

  await queryInterface.changeColumn('quote_tickets', 'fee_currency', {
    type: DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'USD',
  });

  // Remove the old fee column
  await queryInterface.removeColumn('quote_tickets', 'fee');

  // Add index for partner_id
  await queryInterface.addIndex('quote_tickets', ['partner_id'], {
    name: 'idx_quote_tickets_partner',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Add back the original fee column
  await queryInterface.addColumn('quote_tickets', 'fee', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: true, // Allow null initially for migration
  });

  // Migrate data back: copy total_fee to fee
  await queryInterface.sequelize.query(`
    UPDATE quote_tickets 
    SET fee = total_fee
    WHERE total_fee IS NOT NULL
  `);

  // Make fee non-nullable again
  await queryInterface.changeColumn('quote_tickets', 'fee', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: false,
  });

  // Remove the new fee structure columns
  await queryInterface.removeColumn('quote_tickets', 'network_fee');
  await queryInterface.removeColumn('quote_tickets', 'processing_fee');
  await queryInterface.removeColumn('quote_tickets', 'partner_markup_fee');
  await queryInterface.removeColumn('quote_tickets', 'total_fee');
  await queryInterface.removeColumn('quote_tickets', 'fee_currency');
  await queryInterface.removeColumn('quote_tickets', 'partner_id');
}
