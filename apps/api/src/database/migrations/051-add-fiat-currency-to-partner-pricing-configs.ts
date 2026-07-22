import { DataTypes, QueryInterface } from "sequelize";

// Adds an optional fiat-currency scope to partner pricing configs. NULL keeps the previous
// behavior (config applies to every corridor); a scoped row (e.g. MXN) takes precedence over
// the wildcard row at resolution time. The unique index folds NULL into a '*' sentinel so at
// most one wildcard row can exist per (partner, direction) on any Postgres version.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn("partner_pricing_configs", "fiat_currency", {
    allowNull: true,
    type: DataTypes.STRING(8)
  });

  await queryInterface.removeConstraint("partner_pricing_configs", "uniq_partner_pricing_configs_partner_ramp");
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX uniq_partner_pricing_configs_partner_ramp_fiat
    ON partner_pricing_configs (partner_id, ramp_type, COALESCE(fiat_currency, '*'));
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Scoped rows cannot exist under the old (partner_id, ramp_type) unique index; drop them
  // before restoring it.
  await queryInterface.sequelize.query("DELETE FROM partner_pricing_configs WHERE fiat_currency IS NOT NULL;");
  await queryInterface.sequelize.query("DROP INDEX IF EXISTS uniq_partner_pricing_configs_partner_ramp_fiat;");
  await queryInterface.addConstraint("partner_pricing_configs", {
    fields: ["partner_id", "ramp_type"],
    name: "uniq_partner_pricing_configs_partner_ramp",
    type: "unique"
  });
  await queryInterface.removeColumn("partner_pricing_configs", "fiat_currency");
}
