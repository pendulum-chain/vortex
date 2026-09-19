import { DataTypes, QueryInterface } from "sequelize";

// The keeper's subsidy tier for a chunk swap (docs/architecture-monerium-b2b-onramp.md,
// fees section): passed into `swap(reference, route, amountIn, maxSubsidy)` and
// persisted before broadcast, so the calldata-exact crash recovery can rebuild it.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_conversion_executions", "max_subsidy_raw", {
    allowNull: true,
    type: DataTypes.DECIMAL(38, 0)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_conversion_executions", "max_subsidy_raw");
}
