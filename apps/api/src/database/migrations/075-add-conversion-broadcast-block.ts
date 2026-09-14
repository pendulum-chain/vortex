import { DataTypes, QueryInterface } from "sequelize";

// Recovery scans from the block observed immediately before broadcast. Unlike a
// fixed lookback, this remains complete after an arbitrarily long worker outage.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_conversion_executions", "broadcast_block_number", {
    allowNull: true,
    type: DataTypes.INTEGER
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_conversion_executions", "broadcast_block_number");
}
