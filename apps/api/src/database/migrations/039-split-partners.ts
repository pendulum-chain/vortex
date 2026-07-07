import { DataTypes, QueryInterface } from "sequelize";

// Splits partners (today: one row per (name, ramp_type) with pricing inline) into
// partners (unique name, commercial identity) + partner_pricing_configs (per-direction
// pricing). One-shot data migration, no dual-write: the full pre-split table is snapshotted
// to partners_legacy as the backup, duplicate-name rows are folded into a canonical row per
// name, and every FK that pointed at a folded row is repointed BEFORE the fold (the FKs are
// ON DELETE SET NULL — deleting first would null out quote history).
export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Backup snapshot of the pre-split table (kept indefinitely, never read by code).
  await queryInterface.sequelize.query("CREATE TABLE IF NOT EXISTS partners_legacy AS TABLE partners;");

  // 2. New pricing table. Columns moved verbatim from partners; VARCHAR + CHECK instead of
  //    ENUM (plan D6). is_active is per-direction (today a partner can be active for BUY
  //    and inactive for SELL — that lives on the config now).
  await queryInterface.createTable("partner_pricing_configs", {
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    is_active: {
      allowNull: false,
      defaultValue: true,
      type: DataTypes.BOOLEAN
    },
    markup_currency: {
      allowNull: true,
      type: DataTypes.STRING(30)
    },
    markup_type: {
      allowNull: false,
      defaultValue: "none",
      type: DataTypes.STRING(16)
    },
    markup_value: {
      allowNull: false,
      defaultValue: 0,
      type: DataTypes.DECIMAL(10, 4)
    },
    max_dynamic_difference: {
      allowNull: false,
      defaultValue: 0,
      type: DataTypes.DECIMAL(10, 4)
    },
    max_subsidy: {
      allowNull: false,
      defaultValue: 0,
      type: DataTypes.DECIMAL(10, 4)
    },
    min_dynamic_difference: {
      allowNull: false,
      defaultValue: 0,
      type: DataTypes.DECIMAL(10, 4)
    },
    partner_id: {
      allowNull: false,
      type: DataTypes.UUID
    },
    payout_address_evm: {
      allowNull: true,
      type: DataTypes.STRING(255)
    },
    payout_address_substrate: {
      allowNull: true,
      type: DataTypes.STRING(255)
    },
    ramp_type: {
      allowNull: false,
      type: DataTypes.STRING(8)
    },
    target_discount: {
      allowNull: false,
      defaultValue: 0,
      type: DataTypes.DECIMAL(10, 4)
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    vortex_fee_type: {
      allowNull: false,
      defaultValue: "none",
      type: DataTypes.STRING(16)
    },
    vortex_fee_value: {
      allowNull: false,
      defaultValue: 0,
      type: DataTypes.DECIMAL(10, 4)
    }
  });

  await queryInterface.addConstraint("partner_pricing_configs", {
    fields: ["partner_id"],
    name: "fk_partner_pricing_configs_partner_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "partners"
    },
    type: "foreign key"
  });
  await queryInterface.addConstraint("partner_pricing_configs", {
    fields: ["partner_id", "ramp_type"],
    name: "uniq_partner_pricing_configs_partner_ramp",
    type: "unique"
  });
  await queryInterface.sequelize.query(
    `ALTER TABLE "partner_pricing_configs" ADD CONSTRAINT "chk_partner_pricing_configs_ramp_type" CHECK (ramp_type IN ('BUY', 'SELL'));`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "partner_pricing_configs" ADD CONSTRAINT "chk_partner_pricing_configs_markup_type" CHECK (markup_type IN ('absolute', 'relative', 'none'));`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "partner_pricing_configs" ADD CONSTRAINT "chk_partner_pricing_configs_vortex_fee_type" CHECK (vortex_fee_type IN ('absolute', 'relative', 'none'));`
  );
  await queryInterface.sequelize.query(`ALTER TABLE "partner_pricing_configs" ENABLE ROW LEVEL SECURITY;`);

  // 3. One pricing config per legacy (name, ramp_type) row, attached to the canonical
  //    partner for that name (earliest created row; deterministic id tie-break). Where the
  //    same (name, ramp_type) has duplicate rows (nothing prevents it today), prefer the
  //    active row, then the most recently updated — mirroring runtime findOne semantics.
  await queryInterface.sequelize.query(`
    WITH canon AS (
      SELECT DISTINCT ON (name) id, name
      FROM partners
      ORDER BY name, created_at ASC, id ASC
    ),
    source AS (
      SELECT DISTINCT ON (p.name, p.ramp_type) p.*
      FROM partners p
      ORDER BY p.name, p.ramp_type, p.is_active DESC, p.updated_at DESC
    )
    INSERT INTO partner_pricing_configs (
      id, partner_id, ramp_type, markup_type, markup_value, markup_currency,
      vortex_fee_type, vortex_fee_value, target_discount, max_subsidy,
      min_dynamic_difference, max_dynamic_difference,
      payout_address_substrate, payout_address_evm, is_active, created_at, updated_at
    )
    SELECT
      uuid_generate_v4(), c.id, s.ramp_type::text, s.markup_type::text, s.markup_value, s.markup_currency,
      s.vortex_fee_type::text, s.vortex_fee_value, s.target_discount, s.max_subsidy,
      s.min_dynamic_difference, s.max_dynamic_difference,
      s.payout_address_substrate, s.payout_address_evm, s.is_active, s.created_at, s.updated_at
    FROM source s
    JOIN canon c ON c.name = s.name
    ON CONFLICT (partner_id, ramp_type) DO NOTHING;
  `);

  // 4. Repoint FKs from folded rows to the canonical row — BEFORE deleting the folded rows.
  await queryInterface.sequelize.query(`
    WITH canon AS (
      SELECT DISTINCT ON (name) id, name FROM partners ORDER BY name, created_at ASC, id ASC
    ),
    mapping AS (
      SELECT p.id AS old_id, c.id AS new_id
      FROM partners p JOIN canon c ON c.name = p.name
      WHERE p.id <> c.id
    )
    UPDATE quote_tickets q SET partner_id = m.new_id FROM mapping m WHERE q.partner_id = m.old_id;
  `);
  await queryInterface.sequelize.query(`
    WITH canon AS (
      SELECT DISTINCT ON (name) id, name FROM partners ORDER BY name, created_at ASC, id ASC
    ),
    mapping AS (
      SELECT p.id AS old_id, c.id AS new_id
      FROM partners p JOIN canon c ON c.name = p.name
      WHERE p.id <> c.id
    )
    UPDATE quote_tickets q SET pricing_partner_id = m.new_id FROM mapping m WHERE q.pricing_partner_id = m.old_id;
  `);
  await queryInterface.sequelize.query(`
    WITH canon AS (
      SELECT DISTINCT ON (name) id, name FROM partners ORDER BY name, created_at ASC, id ASC
    ),
    mapping AS (
      SELECT p.id AS old_id, c.id AS new_id
      FROM partners p JOIN canon c ON c.name = p.name
      WHERE p.id <> c.id
    )
    UPDATE profile_partner_assignments a SET buy_partner_id = m.new_id FROM mapping m WHERE a.buy_partner_id = m.old_id;
  `);
  await queryInterface.sequelize.query(`
    WITH canon AS (
      SELECT DISTINCT ON (name) id, name FROM partners ORDER BY name, created_at ASC, id ASC
    ),
    mapping AS (
      SELECT p.id AS old_id, c.id AS new_id
      FROM partners p JOIN canon c ON c.name = p.name
      WHERE p.id <> c.id
    )
    UPDATE profile_partner_assignments a SET sell_partner_id = m.new_id FROM mapping m WHERE a.sell_partner_id = m.old_id;
  `);

  // 5. Collapse buy/sell_partner_id on assignments into a single partner_id (they were
  //    always the two direction-rows of the SAME partner_name). Legacy columns stay as
  //    unread backup.
  await queryInterface.addColumn("profile_partner_assignments", "partner_id", {
    allowNull: true,
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "partners"
    },
    type: DataTypes.UUID
  });
  await queryInterface.addIndex("profile_partner_assignments", ["partner_id"], {
    name: "idx_profile_partner_assignments_partner_id"
  });
  await queryInterface.sequelize.query(`
    WITH canon AS (
      SELECT DISTINCT ON (name) id, name FROM partners ORDER BY name, created_at ASC, id ASC
    )
    UPDATE profile_partner_assignments a SET partner_id = c.id
    FROM canon c
    WHERE c.name = a.partner_name AND a.partner_id IS NULL;
  `);

  // 6. Canonical partner is active iff any direction is active (per-direction activity now
  //    lives on the configs).
  await queryInterface.sequelize.query(`
    WITH canon AS (
      SELECT DISTINCT ON (name) id, name FROM partners ORDER BY name, created_at ASC, id ASC
    )
    UPDATE partners p SET is_active = EXISTS (
      SELECT 1 FROM partner_pricing_configs cfg WHERE cfg.partner_id = p.id AND cfg.is_active
    )
    FROM canon c WHERE c.id = p.id;
  `);

  // 7. Fold: delete the non-canonical duplicate rows (their pricing lives in the configs,
  //    their full original state in partners_legacy).
  await queryInterface.sequelize.query(`
    WITH canon AS (
      SELECT DISTINCT ON (name) id, name FROM partners ORDER BY name, created_at ASC, id ASC
    )
    DELETE FROM partners p USING canon c WHERE p.name = c.name AND p.id <> c.id;
  `);

  // 8. Safety net: the migrator swallows ALL bulkInsert errors, so environments exist where
  //    migration 004 is recorded as applied but the vortex seed rows are missing — and fee
  //    distribution hard-fails without them. Recreate partner + both configs idempotently
  //    (seed values from 004).
  await queryInterface.sequelize.query(`
    INSERT INTO partners (id, name, display_name, is_active, ramp_type, created_at, updated_at)
    SELECT uuid_generate_v4(), 'vortex', 'Vortex', TRUE, 'BUY', NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM partners WHERE name = 'vortex');
  `);
  await queryInterface.sequelize.query(`
    INSERT INTO partner_pricing_configs (
      id, partner_id, ramp_type, markup_type, markup_value, markup_currency,
      vortex_fee_type, vortex_fee_value, payout_address_substrate, is_active, created_at, updated_at
    )
    SELECT uuid_generate_v4(), p.id, d.ramp_type, 'relative', 0.0001, 'USDC',
           'none', 0, '6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy', TRUE, NOW(), NOW()
    FROM partners p
    CROSS JOIN (VALUES ('BUY'), ('SELL')) AS d(ramp_type)
    WHERE p.name = 'vortex'
      AND NOT EXISTS (
        SELECT 1 FROM partner_pricing_configs cfg
        WHERE cfg.partner_id = p.id AND cfg.ramp_type = d.ramp_type
      );
  `);

  // 9. The point of the split: a partner name is now a stable, unique handle.
  await queryInterface.sequelize.query(`ALTER TABLE "partners" ADD CONSTRAINT "uniq_partners_name" UNIQUE (name);`);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Best-effort restore: bring back the folded rows from the snapshot; FK repoints on
  // quote_tickets/assignments are not reversed (the canonical ids remain valid rows).
  await queryInterface.sequelize.query(`ALTER TABLE "partners" DROP CONSTRAINT IF EXISTS "uniq_partners_name";`);
  await queryInterface.sequelize.query(`
    INSERT INTO partners
    SELECT l.* FROM partners_legacy l
    WHERE NOT EXISTS (SELECT 1 FROM partners p WHERE p.id = l.id);
  `);
  await queryInterface.removeIndex("profile_partner_assignments", "idx_profile_partner_assignments_partner_id");
  await queryInterface.removeColumn("profile_partner_assignments", "partner_id");
  await queryInterface.dropTable("partner_pricing_configs");
  await queryInterface.sequelize.query("DROP TABLE IF EXISTS partners_legacy;");
}
