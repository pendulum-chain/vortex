import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Step 1: Add column as nullable to allow migration on existing data
  await queryInterface.addColumn("ramp_states", "payment_method", {
    allowNull: true,
    type: DataTypes.STRING(20)
  });

  // Step 2: Populate payment_method for existing rows by deriving from from/to destinations
  // Logic: if 'from' is a payment method (pix, sepa, cbu), use it; otherwise use 'to'
  await queryInterface.sequelize.query(`
    UPDATE ramp_states
    SET payment_method = CASE
      WHEN "from" IN ('pix', 'sepa', 'cbu') THEN "from"
      WHEN "to" IN ('pix', 'sepa', 'cbu') THEN "to"
      ELSE NULL
    END
  `);

  // Step 3: Make column non-nullable now that all rows have values
  await queryInterface.changeColumn("ramp_states", "payment_method", {
    allowNull: false,
    type: DataTypes.STRING(20)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("ramp_states", "payment_method");
}
