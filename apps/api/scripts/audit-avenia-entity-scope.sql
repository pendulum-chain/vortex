-- Avenia entity-scope audit: sizes the population affected by single-entity ownership
-- checks before deciding between profile-wide checks (code fix) and data re-homing.
-- Read-only. Mirrors the type-less getOrCreateCustomerEntityForProfile resolution exactly:
-- the profile's active entity when set (and owned), otherwise its oldest entity
-- (created_at ASC, id ASC). A provider row on any other entity is invisible to the
-- single-entity checks: its owner is denied (403 / "No completed Avenia profile found").
--   * Check 1 is the decision input: 0 means no CURRENT row is affected.
--   * Check 2 must be 0 regardless (the resolver throws on it).
--   * INFO checks size the populations where mismatches live or can re-appear.
-- Execute with psql.

\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- Section 0: sanity — zeros here on a populated database mean RLS is filtering the role
-- and every other result below is meaningless.
SELECT '0. sanity: provider_customers visible' AS check, count(*) AS rows FROM provider_customers
UNION ALL
SELECT '0. sanity: customer_entities visible', count(*) FROM customer_entities;

-- ---------------------------------------------------------------------------
-- Section 1: the decision checks.
-- ---------------------------------------------------------------------------

-- 1. Avenia rows the single-entity ownership check would deny their rightful owner.
SELECT '1. avenia rows invisible to single-entity checks (0 = no current victim)' AS check, count(*) AS rows
FROM provider_customers pc
JOIN customer_entities ce ON ce.id = pc.customer_entity_id
JOIN profiles p ON p.id = ce.profile_id
CROSS JOIN LATERAL (
  SELECT COALESCE(
    (SELECT a.id FROM customer_entities a
     WHERE a.id = p.active_customer_entity_id AND a.profile_id = p.id),
    (SELECT o.id FROM customer_entities o
     WHERE o.profile_id = p.id
     ORDER BY o.created_at ASC, o.id ASC
     LIMIT 1)
  ) AS entity_id
) resolved
WHERE pc.provider = 'avenia'
  AND pc.customer_entity_id <> resolved.entity_id

UNION ALL

-- 2. Corrupt active-entity pointers (resolver throws ACTIVE_ENTITY_OWNERSHIP_MISMATCH).
SELECT '2. profiles whose active entity is not theirs (expect 0)', count(*)
FROM profiles p
WHERE p.active_customer_entity_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM customer_entities ce
    WHERE ce.id = p.active_customer_entity_id AND ce.profile_id = p.id
  )

UNION ALL

-- ---------------------------------------------------------------------------
-- Section 2: INFO — populations where mismatches live or can re-appear.
-- ---------------------------------------------------------------------------

-- 2a. Multi-entity profiles: the only population where a mismatch is possible. Any of
-- these can later flip its resolved entity via active-entity selection (immutable once
-- set), turning a today-visible row into a check-1 victim without any data change.
SELECT '2a. INFO profiles owning more than one entity', count(*)
FROM (
  SELECT ce.profile_id FROM customer_entities ce GROUP BY ce.profile_id HAVING count(*) > 1
) multi

UNION ALL

-- 2b. Migration-040 fold signature: avenia rows whose owning entity type differs from the
-- row's customer_type (business rows folded onto the individual entity).
SELECT '2b. INFO avenia rows typed differently than their owning entity', count(*)
FROM provider_customers pc
JOIN customer_entities ce ON ce.id = pc.customer_entity_id
WHERE pc.provider = 'avenia'
  AND pc.customer_type <> ce.type

UNION ALL

-- 2c. Same as check 1 for the other providers (their services are entity-scoped too).
SELECT '2c. INFO non-avenia rows invisible to single-entity checks', count(*)
FROM provider_customers pc
JOIN customer_entities ce ON ce.id = pc.customer_entity_id
JOIN profiles p ON p.id = ce.profile_id
CROSS JOIN LATERAL (
  SELECT COALESCE(
    (SELECT a.id FROM customer_entities a
     WHERE a.id = p.active_customer_entity_id AND a.profile_id = p.id),
    (SELECT o.id FROM customer_entities o
     WHERE o.profile_id = p.id
     ORDER BY o.created_at ASC, o.id ASC
     LIMIT 1)
  ) AS entity_id
) resolved
WHERE pc.provider <> 'avenia'
  AND pc.customer_entity_id <> resolved.entity_id

UNION ALL

-- 2d. Profiles owning several APPROVED avenia rows across entities with no active-entity
-- selection to disambiguate: profile-wide resolution rejects these as ambiguous.
SELECT '2d. INFO profiles with >1 approved avenia row and no active-entity tiebreak', count(*)
FROM (
  SELECT ce.profile_id
  FROM provider_customers pc
  JOIN customer_entities ce ON ce.id = pc.customer_entity_id
  JOIN profiles p ON p.id = ce.profile_id
  WHERE pc.provider = 'avenia' AND pc.status = 'approved'
  GROUP BY ce.profile_id, p.active_customer_entity_id
  HAVING count(*) > 1
     AND count(*) FILTER (WHERE pc.customer_entity_id = p.active_customer_entity_id) <> 1
) ambiguous;

-- ---------------------------------------------------------------------------
-- Section 3: detail — every check-1 row by non-PII identifier.
-- ---------------------------------------------------------------------------
SELECT
  pc.id AS provider_customer_id,
  pc.status,
  pc.customer_type,
  pc.provider_subaccount_id,
  ce.id AS owning_entity_id,
  ce.type AS owning_entity_type,
  resolved.entity_id AS resolved_entity_id,
  p.id AS profile_id,
  p.active_customer_entity_id IS NOT NULL AS has_active_selection
FROM provider_customers pc
JOIN customer_entities ce ON ce.id = pc.customer_entity_id
JOIN profiles p ON p.id = ce.profile_id
CROSS JOIN LATERAL (
  SELECT COALESCE(
    (SELECT a.id FROM customer_entities a
     WHERE a.id = p.active_customer_entity_id AND a.profile_id = p.id),
    (SELECT o.id FROM customer_entities o
     WHERE o.profile_id = p.id
     ORDER BY o.created_at ASC, o.id ASC
     LIMIT 1)
  ) AS entity_id
) resolved
WHERE pc.provider = 'avenia'
  AND pc.customer_entity_id <> resolved.entity_id
ORDER BY pc.created_at;

COMMIT;
