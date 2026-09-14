import { DataTypes, QueryInterface } from "sequelize";

// A deposit may span multiple capped swaps, and one swap may consume multiple
// deposits. The join table is the accounting source of truth for both directions.
export async function up(queryInterface: QueryInterface): Promise<void> {
  const [[existing]] = (await queryInterface.sequelize.query(
    "SELECT COUNT(*)::integer AS count FROM monerium_fiat_deposits WHERE allocated_execution_id IS NOT NULL"
  )) as [[{ count: number }], unknown];
  if (existing.count > 0) {
    throw new Error("Cannot migrate existing Monerium deposit allocations automatically; reconcile them before deploying");
  }

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
  await queryInterface.sequelize.query(
    "ALTER TABLE monerium_deposit_allocations ADD CONSTRAINT monerium_deposit_allocations_eure_positive CHECK (eure_in_raw > 0)"
  );
  await queryInterface.sequelize.query(
    "ALTER TABLE monerium_deposit_allocations ADD CONSTRAINT monerium_deposit_allocations_usdc_nonnegative CHECK (usdc_net_raw >= 0)"
  );
  await queryInterface.addIndex("monerium_deposit_allocations", ["deposit_id", "execution_id"], { unique: true });
  await queryInterface.addIndex("monerium_deposit_allocations", ["execution_id"]);
  await queryInterface.removeColumn("monerium_fiat_deposits", "allocated_execution_id");
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const [[existing]] = (await queryInterface.sequelize.query(
    "SELECT COUNT(*)::integer AS count FROM monerium_deposit_allocations"
  )) as [[{ count: number }], unknown];
  if (existing.count > 0) {
    throw new Error("Cannot roll back Monerium deposit allocations after accounting rows have been created");
  }

  await queryInterface.addColumn("monerium_fiat_deposits", "allocated_execution_id", {
    allowNull: true,
    type: DataTypes.UUID
  });
  await queryInterface.dropTable("monerium_deposit_allocations", {});
}
