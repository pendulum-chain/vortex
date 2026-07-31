# Temporary report: legacy-schema cleanup migration 057

**Status:** BLOCKED - do not deploy migration 057 until every precondition below is complete.

This report tracks the temporary risks and deployment work for
`apps/api/src/database/migrations/057-drop-legacy-schema.ts`. Delete this report after the
cleanup is verified in production and the lasting architecture, runbook, and security
specifications have been updated.

## Cleanup scope

Migration 057 removes:

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

## Blocking TODOs

- [ ] Record a passing production run of
  `apps/api/scripts/schema-parity-checks.sql`, including the informational/quarantine
  counts, and complete one clean release cycle afterward.
- [ ] Decide and execute the retention/archive policy for historical AlfredPay rows,
  unconverted `kyc_level_2` data, and all `tax_ids` data, especially ownerless rows with
  real Avenia subaccounts.
- [ ] Remove the `TaxId.findByPk` adoption path from `brla.controller.ts`; remove the
  `TaxId` model, model associations/exports, and legacy-adoption tests.
- [ ] Replace `api_keys.partner_name` orphan detection with explicit partner-deletion
  revocation. Backfill/revoke affected keys, change both key validators, stop all writes,
  and remove the field from the model, factories, and tests.
- [ ] Remove `buyPartnerId` and `sellPartnerId` from
  `profilePartnerAssignment.model.ts` and remove their associations from
  `models/index.ts` in a compatibility release while the columns still exist.
- [ ] Confirm the current `Partner` model remains identity-only and all pricing, subsidy,
  dynamic-discount, and payout-address reads resolve through `partner_pricing_configs`.
- [ ] Deploy the compatibility release first and confirm no old API or worker instance is
  running before migration 057 acquires its locks.
- [ ] Audit the live PostgreSQL catalog for unexpected foreign keys, views, materialized
  views, functions, triggers, RLS policies, publications, grants, and cross-schema
  dependencies. Do not add `CASCADE` to bypass a finding.
- [ ] Confirm no Supabase view/RPC, Edge Function, BI export, support script, or other
  external consumer reads the removed objects.
- [ ] Take a restorable pre-migration backup and rehearse restoration. Migration reverts
  older than 057 are no longer a valid recovery strategy.

## Principal risks

1. **Irrecoverable compliance data loss.** `kyc_level_2` was not converted, AlfredPay
   duplicate history was folded, and ownerless `tax_ids` rows were quarantined. Approval
   to delete or an external archive is required.
2. **Authentication regression.** Dropping `api_keys.partner_name` before explicit
   revocation is live can make deleted-partner keys indistinguishable from user-scoped
   keys. Migration 057 aborts while an active orphaned key is visible, but application
   compatibility must still be established before deployment.
3. **Avenia account regression.** Dropping `tax_ids` while the adoption read exists causes
   subaccount creation to fail and abandons any unresolved quarantined account.
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
   Recovery after 057 is application rollback plus database restore, not Umzug revert.
8. **Parity tooling retirement.** `schema-parity-checks.sql` reads every legacy source and
   will fail after cleanup. Preserve its final production result, then archive or replace
   the script as part of the cleanup documentation update.

## Deployment verification

- [ ] Migration 057 is recorded exactly once in `SequelizeMeta` and all listed objects are
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

The final docs must describe the replacement API-key revocation behavior and the chosen
Avenia quarantine/retention policy, not merely remove references to the legacy schema.
