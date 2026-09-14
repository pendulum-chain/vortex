import { DataTypes, QueryInterface } from "sequelize";

// Emission markers for the manager-facing deposit events: set once when the event is
// emitted (whether or not any webhook is subscribed at that moment), so the emitter
// never replays history to a late subscriber and never double-emits after a crash.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_fiat_deposits", "received_event_at", {
    allowNull: true,
    type: DataTypes.DATE
  });
  await queryInterface.addColumn("monerium_fiat_deposits", "converted_event_at", {
    allowNull: true,
    type: DataTypes.DATE
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_fiat_deposits", "converted_event_at");
  await queryInterface.removeColumn("monerium_fiat_deposits", "received_event_at");
}
