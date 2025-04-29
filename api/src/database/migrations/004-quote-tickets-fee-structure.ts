import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // First, add the new fee JSONB column
  await queryInterface.addColumn('quote_tickets', 'fee', {
    type: DataTypes.JSONB,
    allowNull: true, // Allow null initially for migration
  });

  // Add partner_id column
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

  // Migrate existing data: convert the current fee value to the new fee structure
  await queryInterface.sequelize.query(`
    UPDATE quote_tickets 
    SET fee = jsonb_build_object(
      'network', '1.00',
      'processing', fee,
      'partnerMarkup', '0',
      'total', fee,
      'currency', 'USD'
    )
    WHERE fee IS NOT NULL
  `);

  // Make the new fee column non-nullable now that it has values
  await queryInterface.changeColumn('quote_tickets', 'fee', {
    type: DataTypes.JSONB,
    allowNull: false,
  });

  // Add index for partner_id
  await queryInterface.addIndex('quote_tickets', ['partner_id'], {
    name: 'idx_quote_tickets_partner',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Add back the original fee column as a temporary column
  await queryInterface.addColumn('quote_tickets', 'fee_old', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: true, // Allow null initially for migration
  });

  // Migrate data back: extract total fee from the JSONB structure
  await queryInterface.sequelize.query(`
    UPDATE quote_tickets 
    SET fee_old = (fee->>'total')::numeric
    WHERE fee IS NOT NULL
  `);

  // Make fee_old non-nullable
  await queryInterface.changeColumn('quote_tickets', 'fee_old', {
    type: DataTypes.DECIMAL(38, 18),
    allowNull: false,
  });

  // Remove the fee JSONB column
  await queryInterface.removeColumn('quote_tickets', 'fee');

  // Rename fee_old back to fee
  await queryInterface.renameColumn('quote_tickets', 'fee_old', 'fee');

  // Remove the partner_id column and its index
  await queryInterface.removeIndex('quote_tickets', 'idx_quote_tickets_partner');
  await queryInterface.removeColumn('quote_tickets', 'partner_id');
}
