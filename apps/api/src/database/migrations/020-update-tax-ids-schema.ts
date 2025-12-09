import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("tax_ids", "initial_quote_id", {
    allowNull: true,
    type: DataTypes.STRING
  });

  await queryInterface.addColumn("tax_ids", "final_quote_id", {
    allowNull: true,
    type: DataTypes.STRING
  });

  await queryInterface.addColumn("tax_ids", "final_timestamp", {
    allowNull: true,
    type: DataTypes.DATE
  });

  await queryInterface.addColumn("tax_ids", "internal_status", {
    allowNull: true,
    type: DataTypes.ENUM("Consulted", "Requested", "Accepted", "Rejected")
  });

  await queryInterface.addColumn("tax_ids", "requested_date", {
    allowNull: true,
    type: DataTypes.DATE
  });

  await queryInterface.addColumn("tax_ids", "initial_session_id", {
    allowNull: true,
    type: DataTypes.STRING
  });

  await queryInterface.addColumn("tax_ids", "final_session_id", {
    allowNull: true,
    type: DataTypes.STRING
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("tax_ids", "initial_quote_id");
  await queryInterface.removeColumn("tax_ids", "final_quote_id");
  await queryInterface.removeColumn("tax_ids", "final_timestamp");
  await queryInterface.removeColumn("tax_ids", "internal_status");
  await queryInterface.removeColumn("tax_ids", "requested_date");
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_tax_ids_internal_status";').catch(() => {
    // Ignore error if type doesn't exist or if we are not on postgres
  });
  await queryInterface.removeColumn("tax_ids", "initial_session_id");
  await queryInterface.removeColumn("tax_ids", "final_session_id");
}
