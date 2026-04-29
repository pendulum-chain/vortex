import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Add payout_address_evm column to partners table
  await queryInterface.addColumn("partners", "payout_address_evm", {
    allowNull: true,
    comment: "EVM-specific payout address for fee distribution on EVM chains (Base, Ethereum, etc.)",
    field: "payout_address_evm",
    type: DataTypes.STRING(255)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove payout_address_evm column
  await queryInterface.removeColumn("partners", "payout_address_evm");
}
