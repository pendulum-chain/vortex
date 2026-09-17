import { DataTypes, QueryInterface } from "sequelize";

// Automated refund path (docs/architecture-monerium-b2b-onramp.md, "the refund path"):
// a deposit records when its EURe was minted (the promised window counts from there)
// and who paid it (the refund target, from the issue order's counterpart); a recovery
// row drives one deposit from the keeper's `recover` through the reverse swap, the
// float top-up and the Monerium redeem order, one recovery at a time.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_fiat_deposits", "minted_at", { allowNull: true, type: DataTypes.DATE });
  await queryInterface.addColumn("monerium_fiat_deposits", "payer_iban", { allowNull: true, type: DataTypes.STRING(34) });
  await queryInterface.addColumn("monerium_fiat_deposits", "payer_name", { allowNull: true, type: DataTypes.STRING(140) });

  await queryInterface.createTable("monerium_recoveries", {
    attempts: { allowNull: false, defaultValue: 0, type: DataTypes.INTEGER },
    created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    deposit_id: {
      allowNull: false,
      references: { key: "id", model: "monerium_fiat_deposits" },
      type: DataTypes.UUID,
      unique: true
    },
    error: { allowNull: true, type: DataTypes.TEXT },
    eure_from_swap_raw: { allowNull: true, type: DataTypes.DECIMAL(38, 0) },
    eure_recovered_raw: { allowNull: false, type: DataTypes.DECIMAL(38, 0) },
    float_topup_raw: { allowNull: true, type: DataTypes.DECIMAL(38, 0) },
    float_topup_tx_hash: { allowNull: true, type: DataTypes.STRING(66) },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    phase: {
      allowNull: false,
      type: DataTypes.ENUM("moved", "swapping", "swapped", "topping_up", "topped_up", "redeeming", "redeemed")
    },
    redeem_order_id: { allowNull: true, type: DataTypes.STRING(64) },
    refund_amount: { allowNull: true, type: DataTypes.STRING(32) },
    reverse_swap_tx_hash: { allowNull: true, type: DataTypes.STRING(66) },
    surplus_raw: { allowNull: true, type: DataTypes.DECIMAL(38, 0) },
    surplus_tx_hash: { allowNull: true, type: DataTypes.STRING(66) },
    updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    usdc_recovered_raw: { allowNull: false, type: DataTypes.DECIMAL(38, 0) }
  });
  await queryInterface.addIndex("monerium_recoveries", ["phase"]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("monerium_recoveries", {});
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_monerium_recoveries_phase"');
  await queryInterface.removeColumn("monerium_fiat_deposits", "payer_name");
  await queryInterface.removeColumn("monerium_fiat_deposits", "payer_iban");
  await queryInterface.removeColumn("monerium_fiat_deposits", "minted_at");
}
