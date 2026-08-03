# Temporary report: legacy-schema cleanup migration 060

**Status:** BLOCKED - do not deploy migration 060 until every precondition below is complete.

This report tracks the temporary risks and deployment work for
`apps/api/src/database/migrations/060-drop-legacy-schema.ts`. Delete this report after the
cleanup is verified in production and the lasting architecture, runbook, and security
specifications have been updated.

## Cleanup scope

Migration 060 removes:

- Legacy tables: `mykobo_customers`, `alfredpay_customers`, `kyc_level_2`,
  `partners_legacy`, and `tax_ids`.
- The legacy API-key origin marker: `api_keys.partner_name`.
- Unread assignment backups: `profile_partner_assignments.buy_partner_id` and
  `profile_partner_assignments.sell_partner_id`.
- Pricing fields left on `partners` after migration 039 moved their authoritative values
  to `partner_pricing_configs`: `ramp_type`, markup fields, Vortex-fee fields,
  `target_discount`, subsidy/dynamic-difference fields, and both payout-address fields.
- Indexes and table-specific enum types made obsolete by those removals. The shared
  `ramp_direction_enum` is deliberately retained.

The migration runs in one transaction, uses a five-second lock timeout, and lets
PostgreSQL's default `RESTRICT` behavior reject unknown dependencies. Its `down()` always
throws because deleted data cannot be reconstructed.

## Operational Decision

The owner explicitly approves permanent, irreversible deletion of every remaining
legacy-only record removed by migration 060. This includes all `tax_ids` rows (including
ownerless/quarantined rows and unresolved Avenia subaccount references), unconverted
`kyc_level_2` rows, historical or folded `alfredpay_customers` rows, and all records in the
other dropped provider/KYC legacy table (`mykobo_customers`). No migration into the canonical
schema and no separate archive is required.

The accepted consequence is that these records and any provider/KYC history or account
references present only in them will no longer be available after migration 060. Recovery is
not an Umzug revert: operators must take and validate a restorable pre-migration database
backup, and restoring that backup is the only expected way to recover deleted legacy data.
This decision resolves the retention/archive-policy TODO; it does not waive the remaining
application compatibility, catalog/dependency audit, deployment sequencing, or backup
readiness blockers below.

### Required migration gate

Operations must run the following command against production before migration 060:

```bash
psql "$DATABASE_URL" -f apps/api/scripts/schema-parity-checks.sql
```

Use a database-owner or `BYPASSRLS` read-only connection. Section 0 must show plausible
production row counts; if all counts are zero on a database known to contain profiles or
provider customers, stop because row-level security or the wrong database made the audit
meaningless. The script sets `ON_ERROR_STOP`, opens one repeatable-read read-only transaction,
and exits non-zero when the migration gate fails.

Run and preserve the output twice:

1. After the compatibility release is deployed, then observe one clean release cycle.
2. Immediately before migration 060, after every old API and worker instance has stopped and
   before taking the final pre-migration backup.

The second run is authoritative. Do not proceed unless it completes with all of the following:

- Every Section 1 `PARITY` count is `0`.
- Section 4 returns zero finding rows.
- The final output contains
  `MIGRATION GATE PASSED: every eligible legacy provider row has the exact canonical identity mapping and KYC case`.
- `psql` exits with status `0`.

### Output and actions

| Output | Meaning | Required action |
|---|---|---|
| Section 0 counts are implausibly zero | The connection may be filtered by RLS or point to the wrong database. | Stop. Correct the connection/role and rerun the entire script. |
| Any Section 1 count is non-zero | At least one eligible legacy source does not have the exact immutable canonical mapping required by migration 040. | Stop. Use the corresponding Section 4 rows to repair the canonical mapping, then rerun. |
| Section 2 count is non-zero | The rows are in an intentionally unconverted or quarantined bucket: ownerless `tax_ids`, unresolved subaccounts, ownerless provider rows, folded AlfredPay history, active orphaned legacy keys, or `kyc_level_2`. | Preserve the counts. Provider/KYC rows are within the approved deletion scope; active orphaned API keys remain a separate blocker and must be revoked. |
| Section 3 returns rows | Mutable verification status differs between legacy and canonical records. Runtime updates can legitimately cause this after cutover. | Reconcile unexpected differences with provider/runtime history. Do not overwrite newer canonical status merely to make legacy data match. |
| Section 4 returns rows | An eligible source is missing, belongs to the wrong profile, has incorrect immutable corridor/type data, lacks a matching KYC case, or has an ambiguous AlfredPay latest-row tie. | Stop. Repair or explicitly reconcile every listed source identifier and rerun until Section 4 is empty. |
| `MIGRATION GATE FAILED` or non-zero exit | At least one blocking migration defect remains. | Do not run migration 060. Preserve the failed output with the remediation record. |
| `MIGRATION GATE PASSED` and zero exit | Every eligible legacy provider row has the exact canonical identity mapping and matching KYC case in the audited snapshot. | Preserve the full output, take and validate the final backup, then continue only if every other blocker is complete. |

Section 4 identifies Mykobo and AlfredPay sources by legacy UUID and Avenia sources by one-way
tax-reference hash; it does not print email addresses or raw tax IDs. Record the execution
timestamp, target database/environment, deployed commit, latest `SequelizeMeta` migration, operator,
full Sections 0-4 output, and process exit status with the deployment evidence.

Never delete or alter a legacy source row merely to make the gate pass. Repair the canonical
record or document and approve a changed deletion decision through the security risk process.
The gate proves database mapping only; it does not replace provider-side reconciliation, the
external-consumer/catalog audit, old-process drain, or backup/restore rehearsal.

## Blocking TODOs

- [ ] Record a passing production run of
  `apps/api/scripts/schema-parity-checks.sql`, including the informational/quarantine
  counts and the final fail-closed migration gate, and complete one clean release cycle
  afterward. Preserve the Section 4 output: zero rows plus `MIGRATION GATE PASSED` proves
  that every eligible legacy provider row has the exact canonical identity mapping and a
  matching KYC case. The non-zero INFO buckets are the separately approved deletion scope.
- [x] Approve permanent deletion without migration or archive for historical/folded
  AlfredPay rows, unconverted `kyc_level_2` data, all `tax_ids` data (including ownerless
  rows with real Avenia subaccounts), and the other dropped provider/KYC legacy tables.
- [x] Remove the `TaxId.findByPk` adoption path, model, associations/exports, direct
  dependencies, and legacy-adoption tests.
- [ ] Replace `api_keys.partner_name` orphan detection with explicit partner-deletion
  revocation. Backfill/revoke affected keys, change both key validators, stop all writes,
  and remove the field from the model, factories, and tests.
- [x] Remove `buyPartnerId` and `sellPartnerId` from
  `profilePartnerAssignment.model.ts` and remove their associations from
  `models/index.ts` in a compatibility release while the columns still exist.
- [ ] Confirm the current `Partner` model remains identity-only and all pricing, subsidy,
  dynamic-discount, and payout-address reads resolve through `partner_pricing_configs`.
- [ ] Deploy the compatibility release first and confirm no old API or worker instance is
  running before migration 060 acquires its locks.
- [ ] Audit the live PostgreSQL catalog for unexpected foreign keys, views, materialized
  views, functions, triggers, RLS policies, publications, grants, and cross-schema
  dependencies. Do not add `CASCADE` to bypass a finding.
- [ ] Confirm no Supabase view/RPC, Edge Function, BI export, support script, or other
  external consumer reads the removed objects.
- [ ] Take a restorable pre-migration backup and rehearse restoration. Migration reverts
  older than 060 are no longer a valid recovery strategy.

## Principal risks

1. **Approved irrecoverable compliance data loss.** `kyc_level_2` was not converted,
   AlfredPay duplicate history was folded, and ownerless `tax_ids` rows were quarantined.
   The owner has accepted their permanent deletion without migration or archive; restoration
   of the pre-migration backup is the only recovery path.
2. **Authentication regression.** Dropping `api_keys.partner_name` before explicit
   revocation is live can make deleted-partner keys indistinguishable from user-scoped
   keys. Migration 060 aborts while an active orphaned key is visible, but application
   compatibility must still be established before deployment.
3. **Accepted Avenia legacy-account loss.** Unresolved quarantined `tax_ids` accounts are
   intentionally abandoned. The live adoption read, model, and model registration are removed
   from the compatibility release.
4. **Rolling-deploy incompatibility.** Sequelize selects every declared model attribute.
   Old processes will fail after the API-key or assignment columns disappear even if no
   business logic explicitly reads them.
5. **Locking and boot failure.** `ALTER TABLE` and `DROP TABLE` require strong locks. The
   short timeout intentionally aborts API boot rather than waiting indefinitely; retry
   only after identifying the blocking session.
6. **Unknown production dependencies.** The checked-in Supabase snapshot predates the
   unified schema and cannot prove that dashboard-created views, functions, replication,
   or external readers are absent.
7. **Rollback boundary.** Migration 039's `down()` requires `partners_legacy` and the old
   `partners` row shape. Several earlier down migrations likewise expect removed objects.
   Recovery after 060 is application rollback plus database restore, not Umzug revert.
8. **Parity tooling retirement.** `schema-parity-checks.sql` reads every legacy source and
   will fail after cleanup. Preserve its final production result, then archive or replace
   the script as part of the cleanup documentation update.

## Deployment verification

- [ ] Migration 060 is recorded exactly once in `SequelizeMeta` and all listed objects are
  absent from `information_schema`/`pg_catalog`.
- [ ] API-key authentication passes for partner-bound and user-scoped public/secret keys;
  deleted-partner keys remain revoked.
- [ ] BUY and SELL quotes across configured fiat corridors resolve the expected scoped or
  wildcard pricing configuration.
- [ ] Partner fee payout, subsidy caps, and dynamic-discount updates use the expected
  configuration and payout address.
- [ ] Avenia onboarding, account lookup, KYC/KYB polling, quote creation, and ramp
  registration work without querying `tax_ids`.
- [ ] Profile-assigned pricing and its admin list/create/revoke endpoints work without the
  directional backup columns.
- [ ] Error rate, authentication failures, quote failures, and migration/lock logs remain
  clean through the post-deploy observation window.

## Lasting documentation updates

Before deployment, synchronize at least:

- `docs/runbooks/dashboard-schema-production-rollout.md`
- `docs/architecture/unified-user-management-schema.md`
- `docs/security-spec/01-auth/api-keys.md`
- `docs/security-spec/03-ramp-engine/profile-partner-pricing.md`
- `docs/security-spec/05-integrations/brla.md`
- `docs/security-spec/05-integrations/alfredpay.md`

The final docs must describe the replacement API-key revocation behavior and the approved
irreversible Avenia/legacy-provider deletion policy, not merely remove references to the
legacy schema.
