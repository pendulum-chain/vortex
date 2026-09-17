import { DataTypes, QueryInterface } from "sequelize";

// Emission marker for the DEPOSIT_RETURNED manager event, like the received/converted
// markers: fires exactly once per refunded deposit, never replays to late subscribers.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_fiat_deposits", "returned_event_at", { allowNull: true, type: DataTypes.DATE });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_fiat_deposits", "returned_event_at");
}
