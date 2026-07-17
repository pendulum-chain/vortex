-- Parity checks for the 038-049 schema migration (run after each deploy of the 038-049 set; see docs/runbooks/dashboard-schema-production-rollout.md).
-- Read-only. Mirrors the backfill rules of migrations 038/039/040 exactly, so:
--   * PARITY checks must return 0 — any non-zero row count is a real backfill gap.
--   * INFO checks are expected to be non-zero; they size the deliberately-skipped buckets.
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

-- 1b. Mykobo: eligible = has an owning entity; keyed by email.
SELECT '1b. PARITY mykobo rows missing in provider_customers (expect 0)', count(*)
FROM mykobo_customers m
JOIN customer_entities ce ON ce.profile_id = m.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM provider_customers pc
  WHERE pc.provider = 'mykobo' AND pc.provider_customer_id = m.email
)

UNION ALL

-- 1c. Alfredpay: eligible = latest row per (user, country, type) with an owning entity.
SELECT '1c. PARITY alfredpay rows missing in provider_customers (expect 0)', count(*)
FROM (
  SELECT DISTINCT ON (a.user_id, a.country, a.type) a.*
  FROM alfredpay_customers a
  ORDER BY a.user_id, a.country, a.type, a.updated_at DESC
) s
JOIN customer_entities ce ON ce.profile_id = s.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM provider_customers pc
  WHERE pc.provider = 'alfredpay' AND pc.provider_customer_id = s.alfred_pay_id
)

UNION ALL

-- 1d. Avenia: eligible = owned tax_ids rows (user_id set) with an owning entity; keyed by hash.
SELECT '1d. PARITY owned tax_ids missing in provider_customers (expect 0)', count(*)
FROM tax_ids t
JOIN customer_entities ce ON ce.profile_id = t.user_id
WHERE t.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM provider_customers pc
    WHERE pc.provider = 'avenia'
      AND pc.tax_reference_hash = encode(sha256(convert_to(t.tax_id, 'UTF8')), 'hex')
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

-- 2h. Users currently blocked by the one-active-ramp lock (non-terminal ramp). Stale test
--     ramps in mid-flow phases lock their user out until moved to a terminal phase.
SELECT '2h. INFO users with a non-terminal ramp (ramp-locked)', count(DISTINCT user_id)
FROM ramp_states
WHERE current_phase NOT IN ('complete', 'failed', 'timedOut') AND user_id IS NOT NULL

UNION ALL

SELECT '2i. INFO ... of which wedged past initial (need manual terminal-ization)', count(DISTINCT user_id)
FROM ramp_states
WHERE current_phase NOT IN ('complete', 'failed', 'timedOut', 'initial') AND user_id IS NOT NULL;

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
