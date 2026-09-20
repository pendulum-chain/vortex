import { DataTypes, QueryInterface } from "sequelize";

// Every swap is priced against a partner reference rate (a Coinbase VWAP; the window
// length is recorded so the rate can be recomputed from public candles) and may draw a
// subsidy from the vault (docs/architecture-monerium-b2b-onramp.md, fees section). The
// reference and the chosen route are persisted before broadcast (crash-recovery calldata
// identity + audit trail); the subsidy is recorded from the SwapExecuted event.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_conversion_executions", "reference_rate_raw", {
    allowNull: true,
    type: DataTypes.DECIMAL(38, 0)
  });
  await queryInterface.addColumn("monerium_conversion_executions", "reference_source", {
    allowNull: true,
    type: DataTypes.STRING(64)
  });
  await queryInterface.addColumn("monerium_conversion_executions", "reference_window_seconds", {
    allowNull: true,
    type: DataTypes.INTEGER
  });
  await queryInterface.addColumn("monerium_conversion_executions", "reference_at", {
    allowNull: true,
    type: DataTypes.DATE
  });
  await queryInterface.addColumn("monerium_conversion_executions", "route_index", {
    allowNull: true,
    type: DataTypes.INTEGER
  });
  await queryInterface.addColumn("monerium_conversion_executions", "subsidy_raw", {
    allowNull: true,
    type: DataTypes.DECIMAL(38, 0)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_conversion_executions", "subsidy_raw");
  await queryInterface.removeColumn("monerium_conversion_executions", "route_index");
  await queryInterface.removeColumn("monerium_conversion_executions", "reference_at");
  await queryInterface.removeColumn("monerium_conversion_executions", "reference_window_seconds");
  await queryInterface.removeColumn("monerium_conversion_executions", "reference_source");
  await queryInterface.removeColumn("monerium_conversion_executions", "reference_rate_raw");
}
