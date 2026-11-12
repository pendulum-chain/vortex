import { QueryInterface } from "sequelize";

// Internal pricing partner for Robinhood Chain stock quotes. Every such quote prices from these
// rows whoever calls, and quote resolution fails closed without them.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    INSERT INTO partners (id, name, display_name, is_active, created_at, updated_at)
    VALUES (uuid_generate_v4(), 'vortex-stocks', 'Vortex Stocks', TRUE, NOW(), NOW())
    ON CONFLICT (name) DO NOTHING;
  `);
  await queryInterface.sequelize.query(`
    INSERT INTO partner_pricing_configs (
      id, partner_id, ramp_type, fiat_currency, markup_type, markup_value, markup_currency,
      vortex_fee_type, vortex_fee_value, target_discount, max_subsidy, is_active, created_at, updated_at
    )
    SELECT uuid_generate_v4(), p.id, d.ramp_type, 'BRL', 'none', 0, 'USDC',
           'relative', 0.0005, 0, 0, TRUE, NOW(), NOW()
    FROM partners p
    CROSS JOIN (VALUES ('BUY'), ('SELL')) AS d(ramp_type)
    WHERE p.name = 'vortex-stocks'
    ON CONFLICT DO NOTHING;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // The pricing configs cascade. Quote tickets keep their rows with the partner reference nulled.
  await queryInterface.sequelize.query("DELETE FROM partners WHERE name = 'vortex-stocks';");
}
