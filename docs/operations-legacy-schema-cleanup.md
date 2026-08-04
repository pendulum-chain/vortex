# Legacy Schema Cleanup Rollout

Status: migration 060 is blocked until every pre-deployment gate below has current
production evidence.

## Purpose

Safely deploy `apps/api/src/database/migrations/060-drop-legacy-schema.ts`, the irreversible
contract step for the unified identity and partner-pricing schema. The migration removes the
legacy provider/KYC tables, `partners_legacy`, pricing columns copied from `partners` to
`partner_pricing_configs`, `api_keys.partner_name`, and the unread directional partner-assignment
columns. It runs in one transaction with a five-second lock timeout and relies on PostgreSQL's
default `RESTRICT` behavior to reject unknown dependencies.

Permanent deletion without a separate archive is approved for all remaining legacy-only rows,
including `tax_ids` (ownerless/quarantined rows and unresolved Avenia subaccounts),
`kyc_level_2`, folded or historical `alfredpay_customers`, and `mykobo_customers`. The accepted
consequence is loss of provider/KYC history or account references present only in those tables.
Migration 060 has no database `down()` path; recovery requires restoring the validated
pre-migration backup.

For this rollout, **maintenance mode means a full backend shutdown**, not only an active
maintenance schedule: no backend instance may remain alive or serve any API endpoint. The only
permitted backend process is the new instance executing migration 060 during startup, before it
begins listening for API traffic.

## Pre-Deployment Gates

Do not deploy migration 060 until all of these conditions are recorded:

- A maintenance-window hard cutover is scheduled. Maintenance mode must block new quote and ramp
  mutations before operators drain traffic and stop every API and worker process.
- Both API-key validators use explicit partner-deletion revocation, no code writes or reads
  `api_keys.partner_name`, and every active orphaned partner key has been revoked.
- The `Partner` model is identity-only. Pricing, fee, subsidy, dynamic-discount, and payout-address
  reads use `partner_pricing_configs`.
- The application model and associations do not declare
  `profile_partner_assignments.buy_partner_id` or `sell_partner_id`.
- No old API or worker instance remains running before the migration starts.
- The live PostgreSQL catalog has been checked for foreign keys, views, materialized views,
  functions, triggers, RLS policies, publications, grants, and cross-schema dependencies on every
  removed object. Resolve each finding; never add `CASCADE` to bypass it.
- Supabase views/RPCs, Edge Functions, BI exports, support scripts, and other external consumers
  have been checked and no longer read removed objects.
- A restorable pre-migration backup has been taken and restoration has been rehearsed.

## Production Parity Gate

Run the read-only gate with a database-owner or `BYPASSRLS` connection:

```bash
psql "$DATABASE_URL" -f apps/api/scripts/schema-parity-checks.sql
```

Preserve the complete output from the authoritative run immediately before migration 060, after
all old API and worker instances have stopped and before the final backup. Record the timestamp,
environment/database, deployed commit,
latest `SequelizeMeta` migration, operator, Sections 0-4, and process exit status. Section 4 uses
legacy UUIDs and one-way tax-reference hashes rather than email addresses or raw tax IDs.

Proceed only when:

- Section 0 shows plausible production row counts. Implausible zeros on a populated database mean
  the role is filtered by RLS or the connection targets the wrong database.
- Every Section 1 `PARITY` count is zero.
- Section 4 returns no finding rows.
- The final line contains
  `MIGRATION GATE PASSED: every eligible legacy provider row has the exact canonical identity mapping and KYC case`.
- `psql` exits with status zero.

Interpret non-passing output as follows:

| Output | Required action |
|---|---|
| Implausible Section 0 counts | Stop, correct the database or role, and rerun the complete script. |
| Non-zero Section 1 or any Section 4 row | Stop, repair or explicitly reconcile the canonical mapping for every source identifier, and rerun. Never alter a legacy row merely to make the gate pass. |
| Non-zero Section 2 | Preserve the approved-deletion counts. Active orphaned API keys are still blockers and must be revoked. |
| Section 3 status drift | Reconcile against provider/runtime history. Do not overwrite newer canonical status merely to match the legacy snapshot. |
| `MIGRATION GATE FAILED` or non-zero exit | Preserve the output with the remediation record and do not run migration 060. |

The parity gate proves database mapping only. It does not replace provider-side reconciliation,
the catalog/external-consumer audit, process drain, or backup/restore rehearsal.

## Deployment Sequence

1. Activate maintenance mode and verify that new quote and ramp mutations are rejected. Allow
   in-flight work to quiesce.
2. Stop and verify the absence of every old API and worker process. Maintenance mode alone is not
   sufficient because it does not stop workers or prevent a live old process from querying columns
   removed by migration 060.
3. Run and preserve the authoritative parity gate.
4. Take and validate the final restorable backup.
5. Deploy the release containing migration 060. If the five-second lock timeout aborts startup,
   identify the blocking session before retrying; do not increase the timeout blindly.
6. Verify migration 060 appears exactly once in `SequelizeMeta` and all intended tables, columns,
   indexes, and table-specific enum types are absent. The shared `ramp_direction_enum` must remain.
7. Run the smoke tests and monitor through the normal post-deploy observation window.

## Post-Deployment Verification

- Authenticate with partner-bound and profile-managed public/secret credentials; confirm
  deleted-partner credentials remain revoked.
- Create BUY and SELL quotes across configured fiat corridors and verify scoped/wildcard partner
  pricing selection.
- Verify partner fee payout, subsidy caps, dynamic-discount updates, and payout-address resolution
  use the expected pricing configuration.
- Exercise Avenia onboarding, account lookup, KYC/KYB polling, quote creation, and ramp
  registration without any `tax_ids` query.
- Exercise profile-assigned pricing and its admin list/create/revoke routes without the removed
  directional columns.
- Confirm API error rate, authentication failures, quote failures, and migration/lock logs remain
  clean through the observation window.

## Failure And Recovery

Do not use Umzug revert after migration 060. If a removed dependency or data requirement makes
the release unsafe, stop the application, restore the validated pre-migration backup, and deploy
an application version compatible with that restored schema. Preserve the failed migration and
smoke-test evidence for remediation.

After production cleanup is verified, retire or replace
`apps/api/scripts/schema-parity-checks.sql`; it intentionally reads the deleted tables and cannot
run against the post-060 schema.
