import { DataTypes, QueryInterface } from "sequelize";

// Lifecycle reporting for partners (DEPOSIT_UPDATED / ACCOUNT_UPDATED): why a deposit is
// waiting or being refunded, Monerium's rejection reason, and the hash of the last
// snapshot sent so an event fires only when the snapshot changed.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_fiat_deposits", "waiting_reason", { allowNull: true, type: DataTypes.STRING(32) });
  await queryInterface.addColumn("monerium_fiat_deposits", "waiting_since", { allowNull: true, type: DataTypes.DATE });
  await queryInterface.addColumn("monerium_fiat_deposits", "rejected_reason", { allowNull: true, type: DataTypes.STRING(500) });
  await queryInterface.addColumn("monerium_fiat_deposits", "refund_reason", { allowNull: true, type: DataTypes.STRING(32) });
  await queryInterface.addColumn("monerium_fiat_deposits", "refund_started_at", { allowNull: true, type: DataTypes.DATE });
  await queryInterface.addColumn("monerium_fiat_deposits", "lifecycle_event_hash", {
    allowNull: true,
    type: DataTypes.STRING(64)
  });
  await queryInterface.addColumn("monerium_fiat_deposits", "lifecycle_event_at", { allowNull: true, type: DataTypes.DATE });
  await queryInterface.addColumn("monerium_accounts", "lifecycle_event_hash", { allowNull: true, type: DataTypes.STRING(64) });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_accounts", "lifecycle_event_hash");
  for (const column of [
    "lifecycle_event_at",
    "lifecycle_event_hash",
    "refund_started_at",
    "refund_reason",
    "rejected_reason",
    "waiting_since",
    "waiting_reason"
  ]) {
    await queryInterface.removeColumn("monerium_fiat_deposits", column);
  }
}
