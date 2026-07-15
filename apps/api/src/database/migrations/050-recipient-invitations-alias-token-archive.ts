import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("recipient_invitations", "amount");

  await queryInterface.addColumn("recipient_invitations", "alias", {
    allowNull: true,
    type: DataTypes.STRING(100)
  });

  // Raw invite token, retained while the invite is pending so the sender can re-copy the
  // link; cleared on acceptance. Redemption still looks up by token_hash only.
  await queryInterface.addColumn("recipient_invitations", "token", {
    allowNull: true,
    type: DataTypes.STRING(64)
  });

  // Sender-side soft hide: archived invitations disappear from the sender's list but the
  // token stays redeemable.
  await queryInterface.addColumn("recipient_invitations", "archived_at", {
    allowNull: true,
    type: DataTypes.DATE
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("recipient_invitations", "archived_at");
  await queryInterface.removeColumn("recipient_invitations", "token");
  await queryInterface.removeColumn("recipient_invitations", "alias");

  // Data is not restored on revert.
  await queryInterface.addColumn("recipient_invitations", "amount", {
    allowNull: true,
    type: DataTypes.DECIMAL(38, 18)
  });
}
