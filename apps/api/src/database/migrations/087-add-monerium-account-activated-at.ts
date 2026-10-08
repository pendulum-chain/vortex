import { DataTypes, QueryInterface } from "sequelize";

// When an account last became active (operator activation, or auto-activation in the
// sandbox): the dormancy window of a never-converted account runs from here, not from
// its creation, since activation can come long after the account was mapped.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_accounts", "activated_at", { allowNull: true, type: DataTypes.DATE });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("monerium_accounts", "activated_at");
}
