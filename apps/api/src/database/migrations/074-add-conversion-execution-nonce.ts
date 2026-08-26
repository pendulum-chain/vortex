import { DataTypes, QueryInterface } from "sequelize";

// The keeper persists the swap's transaction nonce BEFORE broadcasting, so crash
// recovery can distinguish "never sent" from "sent but the tx hash was lost" (a crash
// or DB error between broadcast and the hash update) by checking nonce consumption
// on chain instead of silently failing the row and double-executing.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_conversion_executions", "nonce", {
    allowNull: true,
    type: DataTypes.INTEGER
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_conversion_executions", "nonce");
}
