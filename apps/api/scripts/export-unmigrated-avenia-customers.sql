-- Export the result grid as CSV from the controlled database environment, then use it as
-- input to reconcile-unmigrated-avenia-status.ts. This query does not expose raw CPF/CNPJ.
-- The result is still restricted data because hashes, user IDs, and provider identifiers
-- can be linked back to customers.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH legacy_avenia AS (
  SELECT
    encode(
      sha256(convert_to(regexp_replace(t.tax_id, '[^0-9]', '', 'g'), 'UTF8')),
      'hex'
    ) AS legacy_tax_hash,
    t.user_id,
    t.account_type::text AS account_type,
    t.sub_account_id,
    t.kyc_attempt,
    t.internal_status::text AS legacy_status
  FROM tax_ids t
)
SELECT
  t.legacy_tax_hash,
  CASE WHEN t.user_id IS NULL THEN 'OWNERLESS' ELSE 'USER_OWNED' END AS owner_status,
  COALESCE(t.user_id::text, '') AS user_id,
  t.account_type,
  t.sub_account_id,
  COALESCE(t.kyc_attempt, '') AS kyc_attempt,
  COALESCE(t.legacy_status, '') AS legacy_status
FROM legacy_avenia t
WHERE COALESCE(t.sub_account_id, '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM provider_customers pc
    WHERE pc.provider = 'avenia'
      AND pc.tax_reference_hash = t.legacy_tax_hash
  )
ORDER BY t.user_id NULLS FIRST, t.legacy_tax_hash;

ROLLBACK;
