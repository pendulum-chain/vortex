import { DataTypes, QueryInterface } from "sequelize";

// Whole-deposit settlement (docs/adr-0005-monerium-b2b-onramp.md, amendment 2026-09-17):
// a swap converts one chunk of one deposit, so an execution carries the deposit it serves
// (1 deposit : N executions) and the N:M allocation join has no job left; a forward and a
// recovery are keeper transactions of their own kind. The client-held fallback role left
// the contract, and the deposit lifecycle gains the settlement and refund states.
const DEPOSIT_STATUS_VALUES = ["converting", "forwarded", "recovering", "refunded", "recovery_failed"];

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ADD VALUE runs outside a transaction (umzug does not wrap migrations); the values
  // are usable by the statements below.
  for (const value of DEPOSIT_STATUS_VALUES) {
    await queryInterface.sequelize.query(`ALTER TYPE "enum_monerium_fiat_deposits_status" ADD VALUE IF NOT EXISTS '${value}'`);
  }

  await queryInterface.addColumn("monerium_conversion_executions", "kind", {
    allowNull: false,
    defaultValue: "swap",
    type: DataTypes.ENUM("swap", "forward", "recover")
  });
  await queryInterface.addColumn("monerium_conversion_executions", "deposit_id", {
    allowNull: true,
    references: { key: "id", model: "monerium_fiat_deposits" },
    type: DataTypes.UUID
  });
  await queryInterface.addIndex("monerium_conversion_executions", ["deposit_id"]);

  // Backfill from the allocation join: an execution that served exactly one deposit is
  // that deposit's chunk. One that spanned several deposits cannot be represented in the
  // 1:N model and must be reconciled by hand before this deploys.
  const [spanning] = (await queryInterface.sequelize.query(
    "SELECT execution_id FROM monerium_deposit_allocations GROUP BY execution_id HAVING COUNT(*) > 1 LIMIT 1"
  )) as [unknown[], unknown];
  if (spanning.length > 0) {
    throw new Error("A Monerium conversion execution spans several deposits; reconcile the allocations before deploying");
  }
  await queryInterface.sequelize.query(
    "UPDATE monerium_conversion_executions AS e SET deposit_id = a.deposit_id " +
      "FROM monerium_deposit_allocations AS a WHERE a.execution_id = e.id"
  );
  // The previous contract forwarded every chunk on the spot: a fully allocated deposit is
  // already at the client's destination.
  await queryInterface.sequelize.query(
    "UPDATE monerium_fiat_deposits AS d SET status = 'forwarded' WHERE d.status = 'minted' AND " +
      "(SELECT COALESCE(SUM(a.eure_in_raw), 0) FROM monerium_deposit_allocations AS a WHERE a.deposit_id = d.id) >= d.amount_raw"
  );

  await queryInterface.dropTable("monerium_deposit_allocations", {});
  await queryInterface.removeColumn("monerium_accounts", "fallback_address");
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("monerium_accounts", "fallback_address", {
    allowNull: true,
    type: DataTypes.STRING(42)
  });
  await queryInterface.createTable("monerium_deposit_allocations", {
    created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    deposit_id: {
      allowNull: false,
      onDelete: "CASCADE",
      references: { key: "id", model: "monerium_fiat_deposits" },
      type: DataTypes.UUID
    },
    eure_in_raw: { allowNull: false, type: DataTypes.DECIMAL(38, 0) },
    execution_id: {
      allowNull: false,
      onDelete: "CASCADE",
      references: { key: "id", model: "monerium_conversion_executions" },
      type: DataTypes.UUID
    },
    id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
    updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
    usdc_net_raw: { allowNull: false, type: DataTypes.DECIMAL(38, 0) }
  });
  await queryInterface.addIndex("monerium_deposit_allocations", ["deposit_id", "execution_id"], { unique: true });
  await queryInterface.addIndex("monerium_deposit_allocations", ["execution_id"]);
  await queryInterface.removeColumn("monerium_conversion_executions", "deposit_id");
  await queryInterface.removeColumn("monerium_conversion_executions", "kind");
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_monerium_conversion_executions_kind"');
  // Postgres cannot drop enum values; the added deposit statuses stay in the type.
}
