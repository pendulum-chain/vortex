import { DataTypes, QueryInterface } from "sequelize";

// The forwarder prices swaps against a reference rate with a per-clone target and floor
// in parts per million (docs/adr-0005-monerium-b2b-onramp.md, B1/P11). The flat
// fee_bps mirror is replaced by both policy values; defaults are the agreed launch policy.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_accounts", "target_ppm", {
    allowNull: false,
    defaultValue: 1250,
    type: DataTypes.INTEGER
  });
  await queryInterface.addColumn("monerium_accounts", "floor_ppm", {
    allowNull: false,
    defaultValue: 1500,
    type: DataTypes.INTEGER
  });
  await queryInterface.removeColumn("monerium_accounts", "fee_bps");
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_accounts", "fee_bps", {
    allowNull: false,
    defaultValue: 0,
    type: DataTypes.INTEGER
  });
  await queryInterface.removeColumn("monerium_accounts", "floor_ppm");
  await queryInterface.removeColumn("monerium_accounts", "target_ppm");
}
