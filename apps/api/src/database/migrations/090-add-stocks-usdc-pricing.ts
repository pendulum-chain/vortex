import type { QueryInterface } from "sequelize";

// Fixed IDs make rollback ownership explicit: conflicting operator rows are preserved.
export async function up(q: QueryInterface): Promise<void> {
  await q.sequelize.query(`
    INSERT INTO partner_pricing_configs (
      id, partner_id, ramp_type, fiat_currency, markup_type, markup_value, markup_currency,
      vortex_fee_type, vortex_fee_value, target_discount, max_subsidy, is_active, created_at, updated_at
    ) SELECT d.id::uuid, p.id, d.ramp_type, NULL, 'none', 0, 'USDC',
      'relative', 0.0005, 0, 0, TRUE, NOW(), NOW()
    FROM partners p CROSS JOIN (VALUES ('BUY', '57eaa58f-1802-413d-9f72-dbd006ae9f29'), ('SELL', '154e156b-40f0-4b12-b420-899e46b8b52f')) d(ramp_type, id)
    WHERE p.name = 'vortex-stocks' ON CONFLICT DO NOTHING;
  `);
}

export async function down(q: QueryInterface): Promise<void> {
  await q.sequelize.query(`DELETE FROM partner_pricing_configs c USING partners p
    WHERE c.partner_id=p.id AND p.name='vortex-stocks' AND c.fiat_currency IS NULL
    AND c.id IN ('57eaa58f-1802-413d-9f72-dbd006ae9f29', '154e156b-40f0-4b12-b420-899e46b8b52f');`);
}
