import { DataTypes, QueryInterface } from "sequelize";

// The reference is the Coinbase bid/ask midpoint (spot) since adr-0005's 2026-09-18
// amendment; the averaging window of the former VWAP has nothing left to record.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_conversion_executions", "reference_window_seconds");
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_conversion_executions", "reference_window_seconds", {
    allowNull: true,
    type: DataTypes.INTEGER
  });
}
