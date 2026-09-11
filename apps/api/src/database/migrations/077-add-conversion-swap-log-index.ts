import { DataTypes, QueryInterface } from "sequelize";

// Allocation waits for the mint cursor to cover the swap and needs the event's
// block-global position so same-block deposits after the swap are not attributed to it.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_conversion_executions", "swap_log_index", {
    allowNull: true,
    type: DataTypes.INTEGER
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_conversion_executions", "swap_log_index");
}
