import { DataTypes, QueryInterface } from "sequelize";

// Keeper chain state for the B2B onramp (docs/prd/monerium-b2b-implementation-plan.md §3):
// - monerium_chain_cursors: persisted getLogs cursors for the poll-based EURe mint
//   watcher, keyed by watcher name (one row per watcher+chain).
// - monerium_fiat_deposits.block_number: the mint block, required by the R04 attribution
//   rule ("mint block <= execution block"); blockHash alone cannot be compared.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("monerium_chain_cursors", {
    created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    last_block: { allowNull: false, type: DataTypes.BIGINT },
    name: { primaryKey: true, type: DataTypes.STRING(64) },
    updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE }
  });

  await queryInterface.addColumn("monerium_fiat_deposits", "block_number", {
    allowNull: true,
    type: DataTypes.INTEGER
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_fiat_deposits", "block_number");
  await queryInterface.dropTable("monerium_chain_cursors");
}
