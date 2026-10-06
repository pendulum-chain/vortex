# Releasing A Squatted BRL Tax ID

Status: current operator runbook. It backs RISK-026 in
[`security-spec/RISK-REGISTER.md`](security-spec/RISK-REGISTER.md); the behavior it works
around is specified in [`security-spec/05-integrations/brla.md`](security-spec/05-integrations/brla.md)
(invariant 48).

## When to use it

`POST /v1/brl/createSubaccount` reserves a CPF/CNPJ for the first authenticated caller. The
unique index `ux_provider_customers_tax_hash` makes that reservation exclusive at once, before
the provider has verified who the caller is. If someone claimed a tax ID that is not theirs, the
real owner's `createSubaccount` fails with `409 A subaccount already exists for this taxId` and
has no self-service recovery. Use this runbook when a person (or company) shows that a tax ID
they own is held by a profile that is not theirs.

Do not use it when the holder's row is `approved`: the provider matched documents to that tax
ID, so the holder is most likely the genuine owner. Escalate to engineering and compliance.

## Ground rules

- Reads use the read-only connection. Changes need a write connection and a second person who
  reviews the verified row IDs before the change runs.
- Record the tax ID only as its hash in tickets and logs. Never paste the raw CPF/CNPJ.
- Run the change in one transaction and check every affected-row count against the read steps
  before committing.

## 1. Identify the claim

Compute the hash the same way `hashTaxReference` does (SHA-256 of the digits-only value) and look
up the holder:

```sql
SELECT encode(sha256(convert_to('<digits only>', 'UTF8')), 'hex') AS tax_hash;

SELECT pc.id, pc.customer_type, pc.status, pc.status_external, pc.provider_subaccount_id,
       pc.created_at, ce.profile_id AS holder_profile_id
FROM provider_customers pc
JOIN customer_entities ce ON ce.id = pc.customer_entity_id
WHERE pc.provider = 'avenia' AND pc.tax_reference_hash = '<tax_hash>';
```

Expect exactly one row and a status other than `approved`. Note `pc.id`,
`provider_subaccount_id` and `holder_profile_id`.

## 2. Check what the holder has started

```sql
SELECT id, type, status, status_external, provider_case_id, submitted_at,
       verification_method, verification_submission->>'status' AS submission_status
FROM kyc_cases
WHERE provider = 'avenia' AND provider_customer_id = '<pc.id>';

SELECT id, current_phase, created_at FROM ramp_states WHERE user_id = '<holder_profile_id>';
```

- A case with `provider_case_id` set, `in_review` status, or a `submitted`/`confirmed` submission
  means an attempt exists at the provider. Ask the provider about that attempt before going on;
  do not release while it could still be approved for this tax ID.
- The ramp query is expected to return no rows: onboarding must be approved before a ramp can be
  registered. Stop and escalate if it returns any.

## 3. Find the exactly-once claim

`createSubaccount` records a `financial_operations` row keyed by the tax hash. If it is left in
place, the real owner's retry hits it with a different request hash (the owner profile is part
of the request) and fails with `409 ... already claimed with different inputs`.

```sql
SELECT id, status, external_id, created_at
FROM financial_operations
WHERE scope_type = 'profile' AND scope_id = '<tax_hash>'
  AND phase = 'createSubaccount' AND provider = 'avenia';
```

Expect exactly one row whose `external_id` equals the `provider_subaccount_id` from step 1. Any
other result means the state is not the expected squat; stop and escalate.

One variant is still a squat: step 1 returns no row, but this query returns a row. The holder's
provider call or local write did not finish, so only the claim remains and it blocks the real
owner the same way. If its `status` is `submitted` or `unknown`, a provider subaccount may exist
without any local record; ask the provider before deleting the row, and treat `external_id` (if
set) as the subaccount for step 4. Skip the `provider_customers` and `kyc_cases` deletes in
step 5.

## 4. Decide on the provider subaccount

Vortex has no call to close or delete a provider subaccount, and the create call carries only
account type and name, so the provider learns the tax ID only if a KYC attempt was submitted
(step 2). Ask the provider to close or flag the subaccount id from step 1, or record it as
abandoned in the operations log. Never reassign it to the real owner: it carries the holder's
unapproved state and data. The real owner's retry creates a fresh subaccount.

## 5. Release

Only after steps 1-4 match, in one transaction:

```sql
BEGIN;
DELETE FROM kyc_cases
 WHERE provider = 'avenia' AND provider_customer_id = '<pc.id>' AND status <> 'approved';   -- rows from step 2
DELETE FROM provider_customers
 WHERE id = '<pc.id>' AND provider = 'avenia' AND status <> 'approved';                     -- exactly 1
DELETE FROM financial_operations
 WHERE id = '<financial_operations.id>' AND scope_id = '<tax_hash>' AND phase = 'createSubaccount';  -- exactly 1
-- compare each reported count with the read steps, then COMMIT or ROLLBACK
```

The holder's `customer_entities` row is the profile's own entity and stays. Decide separately
whether the holder profile should be suspended under the abuse policy.

## 6. Verify and follow up

- Ask the real owner to retry onboarding. `createSubaccount` should return `200` with a new
  `subAccountId`, and the tax hash should now resolve to a row owned by the owner's profile.
- Log the tax hash, the deleted row IDs, the approver and the provider ticket. A second release
  within a quarter is the trigger in RISK-026 to make the reservation exclusive only on approval.
