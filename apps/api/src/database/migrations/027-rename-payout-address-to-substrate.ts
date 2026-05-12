import { QueryInterface } from "sequelize";

// Renames the ambiguous `payout_address` column on the `partners` table to
// `payout_address_substrate` so it is clearly distinguishable from the
// `payout_address_evm` column added in migration 026.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.renameColumn("partners", "payout_address", "payout_address_substrate");
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.renameColumn("partners", "payout_address_substrate", "payout_address");
}
