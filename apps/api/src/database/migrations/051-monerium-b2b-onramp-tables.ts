import { DataTypes, QueryInterface } from "sequelize";

// B2B zero-touch onramp persistence (docs/prd/monerium-b2b-implementation-plan.md §3).
// Deliberately separate from ramp_states: a Monerium IBAN account is permanent and
// repeatedly funded, not a one-shot ramp.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("monerium_accounts", {
    config_version: { allowNull: false, defaultValue: 1, type: DataTypes.INTEGER },
    created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    destination: { allowNull: false, type: DataTypes.STRING(42) },
    dormant_since: { allowNull: true, type: DataTypes.DATE },
    fallback_address: { allowNull: false, type: DataTypes.STRING(42) },
    fee_bps: { allowNull: false, defaultValue: 0, type: DataTypes.INTEGER },
    forwarder_address: { allowNull: false, type: DataTypes.STRING(42), unique: true },
    iban: { allowNull: true, type: DataTypes.STRING(42) },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    profile_id: { allowNull: false, type: DataTypes.STRING(64), unique: true },
    status: {
      allowNull: false,
      defaultValue: "onboarding",
      type: DataTypes.ENUM("onboarding", "active", "suspended", "closed")
    },
    updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE }
  });
  await queryInterface.addIndex("monerium_accounts", ["status"]);

  await queryInterface.createTable("monerium_fiat_deposits", {
    account_id: {
      allowNull: false,
      references: { key: "id", model: "monerium_accounts" },
      type: DataTypes.UUID
    },
    allocated_execution_id: { allowNull: true, type: DataTypes.UUID },
    amount_raw: { allowNull: false, type: DataTypes.DECIMAL(38, 0) },
    block_hash: { allowNull: true, type: DataTypes.STRING(66) },
    chain_id: { allowNull: true, type: DataTypes.INTEGER },
    created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    currency: { allowNull: false, defaultValue: "eur", type: DataTypes.STRING(8) },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    log_index: { allowNull: true, type: DataTypes.INTEGER },
    monerium_order_id: { allowNull: false, type: DataTypes.STRING(64), unique: true },
    status: {
      allowNull: false,
      defaultValue: "pending",
      type: DataTypes.ENUM("pending", "minted", "held", "returned")
    },
    tx_hash: { allowNull: true, type: DataTypes.STRING(66) },
    updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE }
  });
  await queryInterface.addIndex("monerium_fiat_deposits", ["account_id", "status"]);
  // On-chain identity: one deposit per mint log (partial unique — mint fields are null
  // until the Transfer is observed).
  await queryInterface.sequelize.query(
    "CREATE UNIQUE INDEX monerium_fiat_deposits_mint_log ON monerium_fiat_deposits (chain_id, tx_hash, log_index) WHERE tx_hash IS NOT NULL"
  );

  await queryInterface.createTable("monerium_conversion_executions", {
    account_id: {
      allowNull: false,
      references: { key: "id", model: "monerium_accounts" },
      type: DataTypes.UUID
    },
    block_number: { allowNull: true, type: DataTypes.INTEGER },
    created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    destination: { allowNull: false, type: DataTypes.STRING(42) },
    error: { allowNull: true, type: DataTypes.TEXT },
    eure_in_raw: { allowNull: false, type: DataTypes.DECIMAL(38, 0) },
    fee_raw: { allowNull: true, type: DataTypes.DECIMAL(38, 0) },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    status: {
      allowNull: false,
      defaultValue: "pending",
      type: DataTypes.ENUM("pending", "confirmed", "failed")
    },
    tx_hash: { allowNull: true, type: DataTypes.STRING(66) },
    updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    usdc_gross_raw: { allowNull: true, type: DataTypes.DECIMAL(38, 0) },
    usdc_net_raw: { allowNull: true, type: DataTypes.DECIMAL(38, 0) }
  });
  await queryInterface.addIndex("monerium_conversion_executions", ["account_id", "status"]);

  // Durable webhook inbox: persist-before-200 with payload, dedup by delivery id (R06).
  await queryInterface.createTable("monerium_webhook_events", {
    created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    event_id: { allowNull: false, type: DataTypes.STRING(128), unique: true },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    payload: { allowNull: false, type: DataTypes.JSONB },
    processed_at: { allowNull: true, type: DataTypes.DATE }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("monerium_webhook_events");
  await queryInterface.dropTable("monerium_conversion_executions");
  await queryInterface.dropTable("monerium_fiat_deposits");
  await queryInterface.dropTable("monerium_accounts");
  for (const enumName of [
    "enum_monerium_accounts_status",
    "enum_monerium_fiat_deposits_status",
    "enum_monerium_conversion_executions_status"
  ]) {
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${enumName}"`);
  }
}
