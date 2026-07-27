import { DataTypes, Op, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("profiles", "wallet_mode", {
    allowNull: true,
    type: DataTypes.STRING(32)
  });
  await queryInterface.addConstraint("profiles", {
    fields: ["wallet_mode"],
    name: "profiles_wallet_mode_check",
    type: "check",
    where: {
      wallet_mode: { [Op.in]: ["external", "privy_embedded"] }
    }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeConstraint("profiles", "profiles_wallet_mode_check");
  await queryInterface.removeColumn("profiles", "wallet_mode");
}
