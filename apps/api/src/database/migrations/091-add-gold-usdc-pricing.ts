import type { QueryInterface } from "sequelize";

// Internal pricing partner for PAXG on Base bought or sold with native USDC. Every such quote prices from these rows
// whoever calls, and quote resolution fails closed without them. Gold against Pix keeps the default fiat pricing.
// Fixed IDs make rollback ownership explicit: conflicting operator rows are preserved.
export async function up(q: QueryInterface): Promise<void> {
  await q.sequelize.query(`
    INSERT INTO partners (id, name, display_name, is_active, created_at, updated_at)
    VALUES (uuid_generate_v4(), 'vortex-gold', 'Vortex Gold', TRUE, NOW(), NOW())
    ON CONFLICT (name) DO NOTHING;
  `);
  await q.sequelize.query(`
    INSERT INTO partner_pricing_configs (
      id, partner_id, ramp_type, fiat_currency, markup_type, markup_value, markup_currency,
      vortex_fee_type, vortex_fee_value, target_discount, max_subsidy, is_active, created_at, updated_at
    ) SELECT d.id::uuid, p.id, d.ramp_type, NULL, 'none', 0, 'USDC',
      'relative', 0.0005, 0, 0, TRUE, NOW(), NOW()
    FROM partners p CROSS JOIN (VALUES ('BUY', '5d0c4f1e-7d0b-4a1c-9a43-3f6f0f0b7a11'), ('SELL', 'b2a6f3d4-1c57-4f0e-8a9d-6e2c1d5f9b22')) d(ramp_type, id)
    WHERE p.name = 'vortex-gold' ON CONFLICT DO NOTHING;
  `);
}

export async function down(q: QueryInterface): Promise<void> {
  await q.sequelize.query(`DELETE FROM partner_pricing_configs c USING partners p
    WHERE c.partner_id=p.id AND p.name='vortex-gold' AND c.fiat_currency IS NULL
    AND c.id IN ('5d0c4f1e-7d0b-4a1c-9a43-3f6f0f0b7a11', 'b2a6f3d4-1c57-4f0e-8a9d-6e2c1d5f9b22');`);
  // Only when nothing else prices from it. Quote tickets keep their rows with the partner reference nulled.
  await q.sequelize.query(`DELETE FROM partners p WHERE p.name = 'vortex-gold'
    AND NOT EXISTS (SELECT 1 FROM partner_pricing_configs c WHERE c.partner_id = p.id);`);
}
