-- Parity checks for the 038-049 schema migration and the migration 060 production gate.
-- Run according to docs/operations-legacy-schema-cleanup.md.
-- Read-only. Mirrors the backfill rules of migrations 038/039/040 exactly, so:
--   * PARITY checks must return 0 — any non-zero row count is a real backfill gap.
--   * INFO checks are expected to be non-zero; they size the deliberately-skipped buckets.
--   * The final MIGRATION GATE lists every blocking source row by non-PII identifier and
--     raises an exception unless each eligible row has the exact canonical identity mapping.
-- Execute with psql. ON_ERROR_STOP gives automation a non-zero exit on gate failure, while
-- REPEATABLE READ guarantees that the report and final gate inspect one stable snapshot.

\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
--
-- Section 0: sanity — if these return 0 on a database that has data, the readonly role
-- is being filtered by row-level security (new tables have RLS enabled with no policies;
-- a non-owner role needs BYPASSRLS) and every other result below is meaningless.

SELECT '0. sanity: provider_customers visible' AS check, count(*) AS rows FROM provider_customers
UNION ALL
SELECT '0. sanity: customer_entities visible', count(*) FROM customer_entities
UNION ALL
SELECT '0. sanity: legacy mykobo_customers visible', count(*) FROM mykobo_customers
UNION ALL
SELECT '0. sanity: legacy tax_ids visible', count(*) FROM tax_ids;

-- ---------------------------------------------------------------------------
-- Section 1: PARITY — every eligible legacy row must exist in the new schema.
-- All counts must be 0.
-- ---------------------------------------------------------------------------

-- 1a. Profiles without any customer entity (038 backfilled one per profile).
SELECT '1a. PARITY profiles missing customer_entity (expect 0)' AS check, count(*) AS rows
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM customer_entities ce WHERE ce.profile_id = p.id)

UNION ALL

-- 1b. Mykobo: eligible = has an owning entity; verify the complete immutable mapping.
SELECT '1b. PARITY mykobo rows incorrectly mapped (expect 0)', count(*)
FROM mykobo_customers m
WHERE NOT EXISTS (
  SELECT 1
  FROM provider_customers pc
  JOIN customer_entities ce ON ce.id = pc.customer_entity_id
  WHERE pc.provider = 'mykobo'
    AND pc.provider_customer_id = m.email
    AND ce.profile_id = m.user_id
    AND pc.rail = 'eur'
    AND pc.country IS NULL
    AND pc.customer_type = LOWER(m.type::text)
)

UNION ALL

-- 1c. Alfredpay: eligible = latest row per (user, country, type); verify the complete
--     immutable mapping. Older rows in each group remain in the approved-loss INFO bucket.
SELECT '1c. PARITY alfredpay rows incorrectly mapped (expect 0)', count(*)
FROM (
  SELECT DISTINCT ON (a.user_id, a.country, a.type) a.*
  FROM alfredpay_customers a
  ORDER BY a.user_id, a.country, a.type, a.updated_at DESC
) s
WHERE NOT EXISTS (
  SELECT 1
  FROM provider_customers pc
  JOIN customer_entities ce ON ce.id = pc.customer_entity_id
  WHERE pc.provider = 'alfredpay'
    AND pc.provider_customer_id = s.alfred_pay_id
    AND ce.profile_id = s.user_id
    AND pc.rail IS NOT DISTINCT FROM CASE s.country::text
      WHEN 'MX' THEN 'mxn' WHEN 'AR' THEN 'ars' WHEN 'CO' THEN 'cop' WHEN 'US' THEN 'usd'
      WHEN 'BR' THEN 'brl' WHEN 'DO' THEN 'dop' WHEN 'CN' THEN 'cny' WHEN 'HK' THEN 'hkd'
      WHEN 'CL' THEN 'clp' WHEN 'PE' THEN 'pen' WHEN 'BO' THEN 'bob'
    END
    AND pc.country = s.country::text
    AND pc.customer_type = LOWER(s.type::text)
)

UNION ALL

-- 1d. Avenia: eligible = owned tax_ids rows (user_id set); verify the complete immutable
--     mapping. provider_subaccount_id and status are mutable after migration and are audited
--     separately rather than treated as proof of a backfill defect.
SELECT '1d. PARITY owned tax_ids incorrectly mapped (expect 0)', count(*)
FROM tax_ids t
WHERE t.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM provider_customers pc
    JOIN customer_entities ce ON ce.id = pc.customer_entity_id
    WHERE pc.provider = 'avenia'
      AND pc.tax_reference_hash = encode(sha256(convert_to(t.tax_id, 'UTF8')), 'hex')
      AND pc.tax_reference = t.tax_id
      AND ce.profile_id = t.user_id
      AND pc.rail = 'brl'
      AND pc.country = 'BR'
      AND pc.customer_type = CASE t.account_type::text WHEN 'COMPANY' THEN 'business' ELSE 'individual' END
  )

UNION ALL

-- 1e. Every migrated/created provider account has a KYC case (040 created one per row).
SELECT '1e. PARITY provider_customers without any kyc_case (expect 0)', count(*)
FROM provider_customers pc
WHERE NOT EXISTS (SELECT 1 FROM kyc_cases k WHERE k.provider_customer_id = pc.id)

UNION ALL

-- 1f. Partner split: every legacy (name, ramp_type) pricing row survives as a pricing config
--     on the canonical (folded-by-name) partner.
SELECT '1f. PARITY partners_legacy pricing rows missing a pricing config (expect 0)', count(*)
FROM (SELECT DISTINCT name, ramp_type FROM partners_legacy) pl
WHERE NOT EXISTS (
  SELECT 1
  FROM partners p
  JOIN partner_pricing_configs cfg ON cfg.partner_id = p.id
  WHERE p.name = pl.name AND cfg.ramp_type::text = pl.ramp_type::text
)

UNION ALL

-- 1g. Duplicate customer entities per (profile, type) — migration 049's unique index
--     should make this structurally impossible; 0 confirms the index is doing its job.
SELECT '1g. PARITY duplicate customer_entities per (profile,type) (expect 0)', count(*)
FROM (
  SELECT profile_id, type
  FROM customer_entities
  WHERE profile_id IS NOT NULL
  GROUP BY profile_id, type
  HAVING count(*) > 1
) d;

-- ---------------------------------------------------------------------------
-- Section 2: INFO — deliberately skipped / operationally interesting buckets.
-- Non-zero is expected; the numbers tell you whether the skipped rows matter.
-- ---------------------------------------------------------------------------

-- 2a. Quarantined unowned Avenia rows (never migrated by design). If any of these have a
--     real subaccount, that user's KYC status is invisible to the new schema.
SELECT '2a. INFO tax_ids quarantined (user_id IS NULL)' AS check, count(*) AS rows
FROM tax_ids WHERE user_id IS NULL

UNION ALL

SELECT '2b. INFO quarantined rows that have a real subaccount', count(*)
FROM tax_ids WHERE user_id IS NULL AND COALESCE(sub_account_id, '') <> ''

UNION ALL

-- 2c/2d. Legacy rows whose owner has no customer entity — the backfill JOIN silently
--        dropped these. Should be 0 given 038 covered every profile; non-zero means the
--        legacy user_id points at a deleted/foreign profile.
SELECT '2c. INFO mykobo rows whose owner has no entity', count(*)
FROM mykobo_customers m
WHERE NOT EXISTS (SELECT 1 FROM customer_entities ce WHERE ce.profile_id = m.user_id)

UNION ALL

SELECT '2d. INFO alfredpay rows whose owner has no entity', count(*)
FROM alfredpay_customers a
WHERE NOT EXISTS (SELECT 1 FROM customer_entities ce WHERE ce.profile_id = a.user_id)

UNION ALL

SELECT '2e. INFO owned tax_ids whose owner has no entity', count(*)
FROM tax_ids t
WHERE t.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM customer_entities ce WHERE ce.profile_id = t.user_id)

UNION ALL

-- 2f. Alfredpay duplicate folds: older rows per (user, country, type) superseded by the
--     latest one. Informational — mirrors the runtime updatedAt-DESC semantics.
SELECT '2f. INFO alfredpay historical duplicates folded', count(*)
FROM alfredpay_customers a
WHERE EXISTS (
  SELECT 1 FROM alfredpay_customers b
  WHERE b.user_id = a.user_id AND b.country = a.country AND b.type = a.type
    AND b.updated_at > a.updated_at
)

UNION ALL

-- 2g. Orphaned partner API keys (partner deleted/renamed before 041's backfill). These are
--     revoked under the new validators; confirm nothing you rely on is in here.
SELECT '2g. INFO api_keys orphaned (partner_name set, partner_id NULL, active)', count(*)
FROM api_keys
WHERE partner_name IS NOT NULL AND partner_id IS NULL AND is_active

UNION ALL

-- 2h. Explicitly approved for deletion with no conversion.
SELECT '2h. INFO kyc_level_2 rows intentionally not converted', count(*)
FROM kyc_level_2;

-- ---------------------------------------------------------------------------
-- Section 3: STATUS DRIFT -- same account, different status between legacy and new.
-- Legacy statuses are pushed through migration 045's canonicalization first, so a row
-- listed here means the account genuinely changed state after the migration (the new
-- schema is authoritative) -- or a mapping bug. Expected empty right after deploy.
-- ---------------------------------------------------------------------------

SELECT '3a. mykobo status drift' AS check, m.email AS key, m.status::text AS legacy_status, pc.status AS new_status
FROM mykobo_customers m
JOIN provider_customers pc ON pc.provider = 'mykobo' AND pc.provider_customer_id = m.email
WHERE CASE
    WHEN m.status::text IN ('APPROVED', 'SUCCESS', 'Accepted') THEN 'approved'
    WHEN m.status::text IN ('REJECTED', 'FAILED', 'Rejected') THEN 'rejected'
    WHEN m.status::text IN ('USER_COMPLETED', 'VERIFYING', 'Requested', 'PENDING') THEN 'in_review'
    ELSE 'pending'
  END IS DISTINCT FROM pc.status;

SELECT '3b. alfredpay status drift' AS check, s.alfred_pay_id AS key, s.status::text AS legacy_status, pc.status AS new_status
FROM (
  SELECT DISTINCT ON (a.user_id, a.country, a.type) a.*
  FROM alfredpay_customers a
  ORDER BY a.user_id, a.country, a.type, a.updated_at DESC
) s
JOIN provider_customers pc ON pc.provider = 'alfredpay' AND pc.provider_customer_id = s.alfred_pay_id
WHERE CASE
    WHEN s.status::text IN ('APPROVED', 'SUCCESS') THEN 'approved'
    WHEN s.status::text IN ('REJECTED', 'FAILED') THEN 'rejected'
    WHEN s.status::text IN ('USER_COMPLETED', 'VERIFYING') THEN 'in_review'
    WHEN s.status::text IN ('CONSULTED', 'LINK_OPENED', 'UPDATE_REQUIRED') THEN 'started'
    WHEN s.status::text = 'PENDING' THEN 'in_review'
    ELSE 'pending'
  END IS DISTINCT FROM pc.status;

SELECT '3c. avenia status drift' AS check,
       repeat('*', GREATEST(length(pc.tax_reference) - 4, 0)) || right(pc.tax_reference, 4) AS key,
       t.internal_status::text AS legacy_status, pc.status AS new_status
FROM tax_ids t
JOIN provider_customers pc
  ON pc.provider = 'avenia'
 AND pc.tax_reference_hash = encode(sha256(convert_to(t.tax_id, 'UTF8')), 'hex')
WHERE t.user_id IS NOT NULL
  AND CASE
    WHEN COALESCE(t.internal_status::text, 'Consulted') = 'Accepted' THEN 'approved'
    WHEN COALESCE(t.internal_status::text, 'Consulted') = 'Rejected' THEN 'rejected'
    WHEN COALESCE(t.internal_status::text, 'Consulted') = 'Requested' THEN 'in_review'
    WHEN COALESCE(t.internal_status::text, 'Consulted') = 'Consulted' THEN 'started'
    ELSE 'pending'
  END IS DISTINCT FROM pc.status;

-- ---------------------------------------------------------------------------
-- Section 4: MIGRATION GATE — exact legacy-to-canonical identity mapping.
--
-- Run this section immediately before migration 060. It deliberately excludes approved-loss
-- buckets (ownerless tax_ids, folded Alfredpay history, and all kyc_level_2 rows), which remain
-- visible in Section 2. Any row returned below is an unapproved migration defect. Source IDs are
-- UUIDs or one-way tax hashes; email addresses and raw tax IDs are not emitted.
-- ---------------------------------------------------------------------------

WITH alfredpay_source AS (
  SELECT DISTINCT ON (a.user_id, a.country, a.type) a.*
  FROM alfredpay_customers a
  ORDER BY a.user_id, a.country, a.type, a.updated_at DESC
), findings AS (
  SELECT
    'profile'::text AS source,
    p.id::text AS source_id,
    p.id AS expected_profile_id,
    NULL::uuid AS canonical_provider_customer_id,
    'profile has no customer entity'::text AS issue
  FROM profiles p
  WHERE NOT EXISTS (SELECT 1 FROM customer_entities ce WHERE ce.profile_id = p.id)

  UNION ALL

  SELECT
    'mykobo_customers',
    m.id::text,
    m.user_id,
    pc.id,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM customer_entities ce WHERE ce.profile_id = m.user_id)
        THEN 'legacy owner has no customer entity'
      WHEN pc.id IS NULL THEN 'canonical provider customer is missing'
      WHEN ce.profile_id IS DISTINCT FROM m.user_id THEN 'canonical provider customer belongs to the wrong profile'
      ELSE 'canonical rail, country, or customer type does not match migration 040'
    END
  FROM mykobo_customers m
  LEFT JOIN provider_customers pc
    ON pc.provider = 'mykobo' AND pc.provider_customer_id = m.email
  LEFT JOIN customer_entities ce ON ce.id = pc.customer_entity_id
  WHERE pc.id IS NULL
     OR ce.profile_id IS DISTINCT FROM m.user_id
     OR pc.rail IS DISTINCT FROM 'eur'
     OR pc.country IS NOT NULL
     OR pc.customer_type IS DISTINCT FROM LOWER(m.type::text)

  UNION ALL

  SELECT
    'alfredpay_customers',
    STRING_AGG(a.id::text, ',' ORDER BY a.id),
    a.user_id,
    NULL::uuid,
    'multiple rows tie for latest updated_at; migration 040 selection cannot be proven deterministically'
  FROM alfredpay_customers a
  WHERE a.updated_at = (
    SELECT MAX(candidate.updated_at)
    FROM alfredpay_customers candidate
    WHERE candidate.user_id = a.user_id
      AND candidate.country = a.country
      AND candidate.type = a.type
  )
  GROUP BY a.user_id, a.country, a.type, a.updated_at
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT
    'alfredpay_customers',
    s.id::text,
    s.user_id,
    pc.id,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM customer_entities ce WHERE ce.profile_id = s.user_id)
        THEN 'legacy owner has no customer entity'
      WHEN pc.id IS NULL THEN 'canonical provider customer is missing'
      WHEN ce.profile_id IS DISTINCT FROM s.user_id THEN 'canonical provider customer belongs to the wrong profile'
      ELSE 'canonical rail, country, or customer type does not match migration 040'
    END
  FROM alfredpay_source s
  LEFT JOIN provider_customers pc
    ON pc.provider = 'alfredpay' AND pc.provider_customer_id = s.alfred_pay_id
  LEFT JOIN customer_entities ce ON ce.id = pc.customer_entity_id
  WHERE pc.id IS NULL
     OR ce.profile_id IS DISTINCT FROM s.user_id
     OR pc.rail IS DISTINCT FROM CASE s.country::text
       WHEN 'MX' THEN 'mxn' WHEN 'AR' THEN 'ars' WHEN 'CO' THEN 'cop' WHEN 'US' THEN 'usd'
       WHEN 'BR' THEN 'brl' WHEN 'DO' THEN 'dop' WHEN 'CN' THEN 'cny' WHEN 'HK' THEN 'hkd'
       WHEN 'CL' THEN 'clp' WHEN 'PE' THEN 'pen' WHEN 'BO' THEN 'bob'
     END
     OR pc.country IS DISTINCT FROM s.country::text
     OR pc.customer_type IS DISTINCT FROM LOWER(s.type::text)

  UNION ALL

  SELECT
    'tax_ids',
    encode(sha256(convert_to(t.tax_id, 'UTF8')), 'hex'),
    t.user_id,
    pc.id,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM customer_entities owner_ce WHERE owner_ce.profile_id = t.user_id)
        THEN 'legacy owner has no customer entity'
      WHEN pc.id IS NULL THEN 'canonical provider customer is missing'
      WHEN ce.profile_id IS DISTINCT FROM t.user_id THEN 'canonical provider customer belongs to the wrong profile'
      ELSE 'canonical tax reference, rail, country, or customer type does not match migration 040'
    END
  FROM tax_ids t
  LEFT JOIN provider_customers pc
    ON pc.provider = 'avenia'
   AND pc.tax_reference_hash = encode(sha256(convert_to(t.tax_id, 'UTF8')), 'hex')
  LEFT JOIN customer_entities ce ON ce.id = pc.customer_entity_id
  WHERE t.user_id IS NOT NULL
    AND (
      pc.id IS NULL
      OR pc.tax_reference IS DISTINCT FROM t.tax_id
      OR ce.profile_id IS DISTINCT FROM t.user_id
      OR pc.rail IS DISTINCT FROM 'brl'
      OR pc.country IS DISTINCT FROM 'BR'
      OR pc.customer_type IS DISTINCT FROM CASE t.account_type::text
        WHEN 'COMPANY' THEN 'business' ELSE 'individual'
      END
    )

  UNION ALL

  SELECT
    'provider_customers',
    pc.id::text,
    ce.profile_id,
    pc.id,
    'canonical provider customer has no matching KYC case'
  FROM provider_customers pc
  JOIN customer_entities ce ON ce.id = pc.customer_entity_id
  WHERE pc.provider IN ('mykobo', 'alfredpay', 'avenia')
    AND NOT EXISTS (
      SELECT 1
      FROM kyc_cases k
      WHERE k.provider_customer_id = pc.id
        AND k.customer_entity_id = pc.customer_entity_id
        AND k.provider = pc.provider
    )
)
SELECT source, source_id, expected_profile_id, canonical_provider_customer_id, issue
FROM findings
ORDER BY source, source_id;

-- Fail closed so unattended psql execution cannot mistake a result set for success. This is
-- intentionally repeated instead of relying on client-side variables: the gate works in any
-- PostgreSQL client that executes the complete file.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM profiles p
    WHERE NOT EXISTS (SELECT 1 FROM customer_entities ce WHERE ce.profile_id = p.id)
  ) THEN
    RAISE EXCEPTION 'MIGRATION GATE FAILED: profiles without customer entities exist; inspect Section 4';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM mykobo_customers m
    WHERE NOT EXISTS (
      SELECT 1
      FROM provider_customers pc
      JOIN customer_entities ce ON ce.id = pc.customer_entity_id
      WHERE pc.provider = 'mykobo'
        AND pc.provider_customer_id = m.email
        AND ce.profile_id = m.user_id
        AND pc.rail = 'eur'
        AND pc.country IS NULL
        AND pc.customer_type = LOWER(m.type::text)
        AND EXISTS (
          SELECT 1 FROM kyc_cases k
          WHERE k.provider_customer_id = pc.id
            AND k.customer_entity_id = pc.customer_entity_id
            AND k.provider = pc.provider
        )
    )
  ) THEN
    RAISE EXCEPTION 'MIGRATION GATE FAILED: Mykobo migration defects exist; inspect Section 4';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM alfredpay_customers a
    WHERE a.updated_at = (
      SELECT MAX(candidate.updated_at)
      FROM alfredpay_customers candidate
      WHERE candidate.user_id = a.user_id
        AND candidate.country = a.country
        AND candidate.type = a.type
    )
    GROUP BY a.user_id, a.country, a.type, a.updated_at
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'MIGRATION GATE FAILED: ambiguous Alfredpay latest-row ties exist; inspect Section 4';
  END IF;

  IF EXISTS (
    WITH source AS (
      SELECT DISTINCT ON (a.user_id, a.country, a.type) a.*
      FROM alfredpay_customers a
      ORDER BY a.user_id, a.country, a.type, a.updated_at DESC
    )
    SELECT 1
    FROM source s
    WHERE NOT EXISTS (
      SELECT 1
      FROM provider_customers pc
      JOIN customer_entities ce ON ce.id = pc.customer_entity_id
      WHERE pc.provider = 'alfredpay'
        AND pc.provider_customer_id = s.alfred_pay_id
        AND ce.profile_id = s.user_id
        AND pc.rail IS NOT DISTINCT FROM CASE s.country::text
          WHEN 'MX' THEN 'mxn' WHEN 'AR' THEN 'ars' WHEN 'CO' THEN 'cop' WHEN 'US' THEN 'usd'
          WHEN 'BR' THEN 'brl' WHEN 'DO' THEN 'dop' WHEN 'CN' THEN 'cny' WHEN 'HK' THEN 'hkd'
          WHEN 'CL' THEN 'clp' WHEN 'PE' THEN 'pen' WHEN 'BO' THEN 'bob'
        END
        AND pc.country = s.country::text
        AND pc.customer_type = LOWER(s.type::text)
        AND EXISTS (
          SELECT 1 FROM kyc_cases k
          WHERE k.provider_customer_id = pc.id
            AND k.customer_entity_id = pc.customer_entity_id
            AND k.provider = pc.provider
        )
    )
  ) THEN
    RAISE EXCEPTION 'MIGRATION GATE FAILED: Alfredpay migration defects exist; inspect Section 4';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tax_ids t
    WHERE t.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM provider_customers pc
        JOIN customer_entities ce ON ce.id = pc.customer_entity_id
        WHERE pc.provider = 'avenia'
          AND pc.tax_reference_hash = encode(sha256(convert_to(t.tax_id, 'UTF8')), 'hex')
          AND pc.tax_reference = t.tax_id
          AND ce.profile_id = t.user_id
          AND pc.rail = 'brl'
          AND pc.country = 'BR'
          AND pc.customer_type = CASE t.account_type::text WHEN 'COMPANY' THEN 'business' ELSE 'individual' END
          AND EXISTS (
            SELECT 1 FROM kyc_cases k
            WHERE k.provider_customer_id = pc.id
              AND k.customer_entity_id = pc.customer_entity_id
              AND k.provider = pc.provider
          )
      )
  ) THEN
    RAISE EXCEPTION 'MIGRATION GATE FAILED: Avenia migration defects exist; inspect Section 4';
  END IF;

  RAISE NOTICE 'MIGRATION GATE PASSED: every eligible legacy provider row has the exact canonical identity mapping and KYC case';
END
$$;

COMMIT;
