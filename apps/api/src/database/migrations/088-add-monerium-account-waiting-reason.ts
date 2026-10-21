import { DataTypes, QueryInterface } from "sequelize";

// Why an onboarding account cannot get its IBAN, shown to the partner in the account snapshot:
// `monerium_profile_has_iban` while the client's Monerium profile already has an IBAN on another address.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_accounts", "waiting_reason", { allowNull: true, type: DataTypes.STRING(64) });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_accounts", "waiting_reason");
}
