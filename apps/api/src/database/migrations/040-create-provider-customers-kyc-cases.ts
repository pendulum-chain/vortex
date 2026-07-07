import { DataTypes, QueryInterface } from "sequelize";

// Creates provider_customers (unified provider/rail account) + kyc_cases (unified KYC/KYB
// attempts) and backfills them from mykobo_customers, alfredpay_customers and the Avenia
// half of tax_ids. One-shot migration, no dual-write; the legacy tables are left untouched
// as backup. Rows without an owner (tax_ids.user_id IS NULL) are NOT migrated — they stay
// legacy-only until claimed through the existing authenticated createSubaccount flow.
//
// Status values are carried VERBATIM per provider (mykobo CONSULTED/PENDING/APPROVED/REJECTED,
// alfredpay CONSULTED/LINK_OPENED/USER_COMPLETED/VERIFYING/FAILED/SUCCESS/UPDATE_REQUIRED,
// avenia Consulted/Requested/Accepted/Rejected) so every existing status comparison keeps
// working; the dashboard aggregator normalizes at read time. UPDATE_REQUIRED is included even
// though the legacy alfredpay enum lacks it — the shared enum has it and writes of it crashed
// against the legacy table (latent bug this schema fixes).
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("provider_customers", {
    country: {
      allowNull: true,
      type: DataTypes.STRING(4)
    },
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    customer_entity_id: {
      allowNull: false,
      type: DataTypes.UUID
    },
    customer_type: {
      allowNull: false,
      defaultValue: "individual",
      type: DataTypes.STRING(16)
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    last_failure_reasons: {
      allowNull: true,
      defaultValue: [],
      type: DataTypes.JSONB
    },
    provider: {
      allowNull: false,
      type: DataTypes.STRING(16)
    },
    provider_customer_id: {
      allowNull: true,
      type: DataTypes.STRING(255)
    },
    provider_subaccount_id: {
      allowNull: true,
      type: DataTypes.STRING(255)
    },
    rail: {
      allowNull: true,
      type: DataTypes.STRING(8)
    },
    status: {
      allowNull: false,
      type: DataTypes.STRING(32)
    },
    status_external: {
      allowNull: true,
      type: DataTypes.STRING(255)
    },
    tax_reference_hash: {
      allowNull: true,
      type: DataTypes.STRING(64)
    },
    tax_reference_masked: {
      allowNull: true,
      type: DataTypes.STRING(64)
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  await queryInterface.addConstraint("provider_customers", {
    fields: ["customer_entity_id"],
    name: "fk_provider_customers_customer_entity_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "customer_entities"
    },
    type: "foreign key"
  });

  await queryInterface.sequelize.query(
    `ALTER TABLE "provider_customers" ADD CONSTRAINT "chk_provider_customers_provider" CHECK (provider IN ('mykobo', 'alfredpay', 'avenia'));`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "provider_customers" ADD CONSTRAINT "chk_provider_customers_customer_type" CHECK (customer_type IN ('individual', 'business'));`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "provider_customers" ADD CONSTRAINT "chk_provider_customers_status" CHECK (status IN (
      'CONSULTED', 'PENDING', 'APPROVED', 'REJECTED',
      'LINK_OPENED', 'USER_COMPLETED', 'VERIFYING', 'FAILED', 'SUCCESS', 'UPDATE_REQUIRED',
      'Consulted', 'Requested', 'Accepted', 'Rejected'
    ));`
  );

  // Partial uniques: the external ids are the durable per-provider keys where they exist
  // (alfredpay customer id, mykobo email, avenia subaccount id). The tax hash reproduces the
  // legacy "one tax ID globally" dedup guard without storing raw tax IDs.
  await queryInterface.sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ux_provider_customers_provider_customer"
     ON "provider_customers" (provider, provider_customer_id) WHERE provider_customer_id IS NOT NULL;`
  );
  await queryInterface.sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ux_provider_customers_subaccount"
     ON "provider_customers" (provider, provider_subaccount_id) WHERE provider_subaccount_id IS NOT NULL;`
  );
  await queryInterface.sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ux_provider_customers_tax_hash"
     ON "provider_customers" (provider, tax_reference_hash) WHERE tax_reference_hash IS NOT NULL;`
  );
  // One account per entity/corridor/type — except avenia, where legacy data legitimately has
  // multiple tax-id accounts per user (resolveAveniaAccount errors on >1 Accepted at runtime;
  // that behavior is preserved, not turned into a migration failure).
  await queryInterface.sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ux_provider_customers_entity_corridor"
     ON "provider_customers" (provider, customer_entity_id, rail, COALESCE(country, ''), customer_type)
     WHERE provider <> 'avenia';`
  );
  await queryInterface.addIndex("provider_customers", ["customer_entity_id"], {
    name: "idx_provider_customers_customer_entity_id"
  });
  await queryInterface.sequelize.query(`ALTER TABLE "provider_customers" ENABLE ROW LEVEL SECURITY;`);

  await queryInterface.createTable("kyc_cases", {
    approved_at: {
      allowNull: true,
      type: DataTypes.DATE
    },
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    customer_entity_id: {
      allowNull: false,
      type: DataTypes.UUID
    },
    failure_reasons: {
      allowNull: true,
      defaultValue: [],
      type: DataTypes.JSONB
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    level: {
      allowNull: true,
      type: DataTypes.STRING(16)
    },
    provider: {
      allowNull: false,
      type: DataTypes.STRING(16)
    },
    provider_case_id: {
      allowNull: true,
      type: DataTypes.STRING(255)
    },
    provider_customer_id: {
      allowNull: true,
      type: DataTypes.UUID
    },
    rejected_at: {
      allowNull: true,
      type: DataTypes.DATE
    },
    status: {
      allowNull: false,
      type: DataTypes.STRING(32)
    },
    status_external: {
      allowNull: true,
      type: DataTypes.STRING(255)
    },
    submitted_at: {
      allowNull: true,
      type: DataTypes.DATE
    },
    type: {
      allowNull: false,
      defaultValue: "kyc",
      type: DataTypes.STRING(8)
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  await queryInterface.addConstraint("kyc_cases", {
    fields: ["customer_entity_id"],
    name: "fk_kyc_cases_customer_entity_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "customer_entities"
    },
    type: "foreign key"
  });
  await queryInterface.addConstraint("kyc_cases", {
    fields: ["provider_customer_id"],
    name: "fk_kyc_cases_provider_customer_id",
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "provider_customers"
    },
    type: "foreign key"
  });
  await queryInterface.sequelize.query(
    `ALTER TABLE "kyc_cases" ADD CONSTRAINT "chk_kyc_cases_type" CHECK (type IN ('kyc', 'kyb'));`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "kyc_cases" ADD CONSTRAINT "chk_kyc_cases_provider" CHECK (provider IN ('mykobo', 'alfredpay', 'avenia'));`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "kyc_cases" ADD CONSTRAINT "chk_kyc_cases_status" CHECK (status IN (
      'CONSULTED', 'PENDING', 'APPROVED', 'REJECTED',
      'LINK_OPENED', 'USER_COMPLETED', 'VERIFYING', 'FAILED', 'SUCCESS', 'UPDATE_REQUIRED',
      'Consulted', 'Requested', 'Accepted', 'Rejected'
    ));`
  );
  await queryInterface.addIndex("kyc_cases", ["customer_entity_id"], {
    name: "idx_kyc_cases_customer_entity_id"
  });
  await queryInterface.addIndex("kyc_cases", ["provider_customer_id"], {
    name: "idx_kyc_cases_provider_customer_id"
  });
  await queryInterface.sequelize.query(`ALTER TABLE "kyc_cases" ENABLE ROW LEVEL SECURITY;`);

  // --- Backfills (idempotent via NOT EXISTS; timestamps preserved from source rows) ---

  // Mykobo: one row per user (user_id is unique). The provider-side durable key is the
  // (last-synced) email → provider_customer_id. Rail is implicitly EUR; no country.
  await queryInterface.sequelize.query(`
    INSERT INTO provider_customers (
      id, customer_entity_id, provider, rail, country, provider_customer_id,
      customer_type, status, status_external, last_failure_reasons, created_at, updated_at
    )
    SELECT
      uuid_generate_v4(), ce.id, 'mykobo', 'eur', NULL, m.email,
      LOWER(m.type::text), m.status::text, m.status_external,
      COALESCE(to_jsonb(m.last_failure_reasons), '[]'::jsonb), m.created_at, m.updated_at
    FROM mykobo_customers m
    JOIN customer_entities ce ON ce.profile_id = m.user_id
    WHERE NOT EXISTS (
      SELECT 1 FROM provider_customers pc
      WHERE pc.provider = 'mykobo' AND pc.provider_customer_id = m.email
    );
  `);

  // AlfredPay: one row per (user, country, type), keeping the most recently updated where
  // historical duplicates exist (mirrors the runtime updatedAt-DESC findOne semantics).
  await queryInterface.sequelize.query(`
    WITH source AS (
      SELECT DISTINCT ON (a.user_id, a.country, a.type) a.*
      FROM alfredpay_customers a
      ORDER BY a.user_id, a.country, a.type, a.updated_at DESC
    )
    INSERT INTO provider_customers (
      id, customer_entity_id, provider, rail, country, provider_customer_id,
      customer_type, status, status_external, last_failure_reasons, created_at, updated_at
    )
    SELECT
      uuid_generate_v4(), ce.id, 'alfredpay',
      CASE s.country::text
        WHEN 'MX' THEN 'mxn' WHEN 'AR' THEN 'ars' WHEN 'CO' THEN 'cop' WHEN 'US' THEN 'usd'
        WHEN 'BR' THEN 'brl' WHEN 'DO' THEN 'dop' WHEN 'CN' THEN 'cny' WHEN 'HK' THEN 'hkd'
        WHEN 'CL' THEN 'clp' WHEN 'PE' THEN 'pen' WHEN 'BO' THEN 'bob'
      END,
      s.country::text, s.alfred_pay_id,
      LOWER(s.type::text), s.status::text, s.status_external,
      COALESCE(to_jsonb(s.last_failure_reasons), '[]'::jsonb), s.created_at, s.updated_at
    FROM source s
    JOIN customer_entities ce ON ce.profile_id = s.user_id
    WHERE NOT EXISTS (
      SELECT 1 FROM provider_customers pc
      WHERE pc.provider = 'alfredpay' AND pc.provider_customer_id = s.alfred_pay_id
    );
  `);

  // Avenia (tax_ids): only owned rows migrate (user_id IS NULL rows are quarantined in the
  // legacy table per the no-auto-assign rule). The raw tax id is replaced by a sha256 hash
  // (runtime lookups hash the taxId from ramp state) + a masked display value. Empty-string
  // sub_account_id is the legacy "no subaccount yet" sentinel → NULL.
  await queryInterface.sequelize.query(`
    INSERT INTO provider_customers (
      id, customer_entity_id, provider, rail, country, provider_subaccount_id,
      tax_reference_hash, tax_reference_masked,
      customer_type, status, created_at, updated_at
    )
    SELECT
      uuid_generate_v4(), ce.id, 'avenia', 'brl', 'BR', NULLIF(t.sub_account_id, ''),
      encode(sha256(convert_to(t.tax_id, 'UTF8')), 'hex'),
      repeat('*', GREATEST(length(t.tax_id) - 4, 0)) || right(t.tax_id, 4),
      CASE t.account_type::text WHEN 'COMPANY' THEN 'business' ELSE 'individual' END,
      COALESCE(t.internal_status::text, 'Consulted'), t.created_at, t.updated_at
    FROM tax_ids t
    JOIN customer_entities ce ON ce.profile_id = t.user_id
    WHERE t.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM provider_customers pc
        WHERE pc.provider = 'avenia'
          AND pc.tax_reference_hash = encode(sha256(convert_to(t.tax_id, 'UTF8')), 'hex')
      );
  `);

  // kyc_cases: one case per migrated provider account mirroring its current verification
  // state (type kyb for business customers). Avenia cases carry the workflow timestamps from
  // tax_ids (requested_date/final_timestamp); mykobo/alfredpay have no recorded lifecycle
  // timestamps to convert. kyc_level_2 is dead in apps/api — superseded with NO data
  // conversion.
  await queryInterface.sequelize.query(`
    INSERT INTO kyc_cases (
      id, customer_entity_id, provider_customer_id, provider, level, type,
      status, status_external, failure_reasons, submitted_at, approved_at, rejected_at,
      created_at, updated_at
    )
    SELECT
      uuid_generate_v4(), pc.customer_entity_id, pc.id, pc.provider, 'level_1',
      CASE WHEN pc.customer_type = 'business' THEN 'kyb' ELSE 'kyc' END,
      pc.status, pc.status_external, COALESCE(pc.last_failure_reasons, '[]'::jsonb),
      t.requested_date,
      CASE WHEN pc.status = 'Accepted' THEN t.final_timestamp END,
      CASE WHEN pc.status = 'Rejected' THEN t.final_timestamp END,
      pc.created_at, pc.updated_at
    FROM provider_customers pc
    LEFT JOIN tax_ids t
      ON pc.provider = 'avenia'
     AND pc.tax_reference_hash = encode(sha256(convert_to(t.tax_id, 'UTF8')), 'hex')
    WHERE NOT EXISTS (
      SELECT 1 FROM kyc_cases k WHERE k.provider_customer_id = pc.id
    );
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("kyc_cases");
  await queryInterface.dropTable("provider_customers");
}
