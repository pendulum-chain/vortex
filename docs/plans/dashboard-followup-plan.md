# Dashboard follow-up plan

Deferred, non-blocking work items surfaced while wiring the dashboard to the real
backend. Each item is self-contained: it states the finding, the rationale, the concrete
change set, and how to verify. This is the queue for unresolved follow-up work, not a diff.

Companion to `dashboard-full-product-connection.md` (the main product-connection plan).

---

## 1. Drop `provider_customers.tax_reference_masked` — mask at query time instead

**Status:** planned, not started.

### Finding

`provider_customers` (migration `040-create-provider-customers-kyc-cases.ts`) carries three
tax columns:

| Column | Purpose | Read today? |
| :-- | :-- | :-- |
| `tax_reference` | Raw normalized (digits-only) tax id, avenia only. Join/aggregation key for in-flight ramp state (`ramp_states.state.taxId`, `getPendingBrlVolume`). | Yes |
| `tax_reference_hash` | sha256 of the normalized id. Backs the `ux_provider_customers_tax_hash` unique index (the "one tax id globally" dedup guard) and all runtime lookups (`findAveniaCustomerByTaxId`). | Yes |
| `tax_reference_masked` | `***…####` display string. | **No — written only, never read.** |

`tax_reference_masked` is populated at four sites and backfilled once, but nothing consumes
it:

- `apps/api/src/api/controllers/brla.controller.ts:230, 389, 416` — three `ProviderCustomer` create/update writes.
- `apps/api/src/test-utils/factories.ts:213` — test factory.
- `apps/api/src/database/migrations/040-…​.ts:83, 318, 325` — column definition + backfill.
- `apps/api/src/models/providerCustomer.model.ts:36, 54, 75, 161` — attribute/model wiring.

A repo-wide grep for `.taxReferenceMasked` (reads) returns **zero** hits. The onboarding
status controller/aggregator does not read it.

### Rationale for removal

Because the **raw** `tax_reference` is already retained on the same row (a deliberate,
documented deviation from the unified doc's "no raw tax IDs" non-goal — it is the ramp-state
join key and cannot be dropped while legacy ramp state carries `taxId`), storing a
precomputed masked copy buys nothing: it is a lossy projection of a value we already hold.
Any masked display can be produced at read time from `tax_reference` via the existing pure
helper `maskTaxReference()` (`apps/api/src/api/services/avenia/avenia-customer.service.ts:10`).

Keeping a second, denormalized copy of the same PII only adds write paths to keep in sync and
a second column to reason about in the security spec.

> Note: this removes only `tax_reference_masked`. `tax_reference_hash` **stays** — it backs a
> unique index and the hashed-lookup path, and cannot be derived at query time against an
> index without a generated column (out of scope here).

### Change set

1. **New forward migration** (next number, `044-…`): `removeColumn("provider_customers", "tax_reference_masked")`. Its `down` re-adds the column and repopulates from `tax_reference` (`repeat('*', GREATEST(length(tax_reference)-4,0)) || right(tax_reference,4)`) so the migration is reversible without data loss. Do **not** edit `040` — it has shipped.
2. **Model** `providerCustomer.model.ts`: remove `taxReferenceMasked` from `ProviderCustomerAttributes`, the `Optional<>` creation union, the `declare`, and the `init()` column map.
3. **Write sites** `brla.controller.ts` (×3): delete the `taxReferenceMasked: maskTaxReference(...)` lines. Check whether `maskTaxReference` remains imported/used there — after this it is only used by the (future) query-time display path and possibly tests; keep the helper exported, but drop the now-unused import from `brla.controller.ts` if nothing else there uses it (surgical-changes rule).
4. **Test factory** `test-utils/factories.ts:213`: drop the field; keep the `maskTaxReference` import only if still used.
5. **Query-time masking (only where a consumer actually needs it):** none exists today, so add nothing speculatively. When the dashboard onboarding view eventually needs a masked tax display, derive it in that DTO/mapper via `maskTaxReference(row.taxReference)`. Record this as the intended pattern; do not pre-build the mapper.
6. **Keep `maskTaxReference()`** in `avenia-customer.service.ts` — it becomes the single query-time masking primitive.

### Spec updates (same change set — Security Spec Sync)

- `docs/architecture/unified-user-management-schema.md:91,195`: drop the `tax_reference_masked` row/field from the `provider_customers` table and the ER diagram; add a one-line note that masked display is derived at read time from `tax_reference` via `maskTaxReference`.
- `docs/security-spec/05-integrations/brla.md` ("Provider-customers cutover" section): the tax-column description currently names hash + raw; adjust to reflect that no masked copy is persisted and masking is derived on read.

### Verification

- `bun typecheck` (api) — the removed attribute must not break any reader (there are none).
- `grep -rin "taxReferenceMasked\|tax_reference_masked" apps/ packages/` returns only the new down-migration.
- `cd apps/api && bun migrate` then `bun migrate:revert-last` round-trips cleanly on a seeded DB; spot-check that `down` repopulates the masked column identically to the `040` backfill expression.
- Existing avenia/brla controller + `notifications-onboarding.integration.test.ts` suites still pass.

### Risks / caveats

- **External DB consumers.** Removal assumes nothing outside this repo (analytics job, Supabase view, BI export) reads `provider_customers.tax_reference_masked`. Confirm before shipping; if an external reader exists, expose a masked value through a view/DTO rather than the base column.
- Purely additive-then-drop; no fund-flow or auth path touches the masked column, so runtime risk is low.

---

## 1.1: normalize `status` from kyc_cases and provider_costumers to a single enum across rails.
Currently Mykobo flow at least, sets to approved not SUCCESS, Avenia to accepted ...

Also, for Avenia, add changes to store name of Companies on table (provider_customer) for quick lookup. + backend change to fill it up on kyb creation flow (right after the user has sent us the data and we relayed it, we can now query from Avenia the user and fetch -fill the table with the business name. Also add this same functionality (if name not in table ) to status endpoint to fill existing ones.
---
