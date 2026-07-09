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

## 2. Add AlfredPay fiat-account management to the dashboard

**Status:** planned, not started.

### Finding

The dashboard already derives AlfredPay self-recipients from saved provider-side fiat accounts:

- `apps/dashboard/src/hooks/useRecipients.ts` fetches `GET /v1/alfredpay/fiatAccounts` for the
  approved AlfredPay corridors (`US`, `MX`, `CO`, `AR`).
- `apps/dashboard/src/services/api/recipient.mappers.ts` turns each returned fiat account into one
  `isSelf` recipient whose `fiatAccountId` is later sent during transfer registration.
- BR and EU use a fallback self-recipient, but AlfredPay does **not**: no saved fiat account means
  no self-recipient row.

That makes a KYC-approved sender look partially onboarded: Mexico/Colombia/US/Argentina can be
approved in `GET /v1/onboarding/status`, but the Recipients and Transfer pages still show no
AlfredPay self destination until at least one fiat account exists for the corresponding country.

The backend endpoint to create the provider-side object already exists:

- `POST /v1/alfredpay/fiatAccounts` creates the AlfredPay fiat account for the authenticated
  effective user and country.
- `GET /v1/alfredpay/fiatAccounts?country=XX` lists saved accounts.
- `DELETE /v1/alfredpay/fiatAccounts/:fiatAccountId?country=XX` deletes one.

The dashboard only wraps the list call today. It does not expose a UI to add or remove accounts.

### Product rule

For every approved AlfredPay corridor, the dashboard must make the missing payout-account step
obvious and completable in place:

| Corridor | Country | Fiat account method | Provider type sent to API |
| :-- | :-- | :-- | :-- |
| Mexico | `MX` | CLABE / SPEI | `SPEI` |
| Colombia | `CO` | Account number / ACH Colombia | `ACH` |
| United States | `US` | ACH/Wire-style bank details | `BANK_USA` |
| Argentina | `AR` | CBU/CVU/Alias | `COELSA` |

The UI should create provider-side AlfredPay fiat accounts for **self recipients**. Third-party
recipient payout references remain governed by main plan §7.1 and still need the separate
recipient-payout decision; do not conflate this work with `recipient_payout_references` for invited
recipients.

### UX spec

1. **Recipients page empty state.** If an AlfredPay corridor is approved but its fiat-account query
   returns zero accounts, show a corridor-scoped call to action: "Add your Mexico CLABE", "Add your
   Colombia account", etc. Do not silently omit the corridor.
2. **Self-recipient list.** For each saved fiat account, keep rendering one self-recipient with the
   masked label from the provider response. Multiple accounts in the same corridor produce multiple
   self-recipient rows.
3. **Add-account entry points.** Add an "Add payout account" action from the Recipients page and
   from the Transfer page when the selected/only approved AlfredPay corridor has no account.
4. **Form shape.** Reuse the widget's existing form definitions and validation patterns rather than
   inventing new field requirements:
   - `apps/frontend/src/constants/fiatAccountMethods.ts` for corridor → method mapping.
   - `apps/frontend/src/constants/fiatAccountForms.ts` for per-method field lists.
   - `apps/frontend/src/pages/alfredpay/FiatAccountRegistration/RegisterFiatAccountScreen.tsx` for
     request mapping and validation rules.
5. **Dashboard implementation home.** Do not import from `apps/frontend` directly. Either copy the
   small constants/form into the dashboard first, or extract the provider-neutral form config to a
   small shared package/module in the same change. Prefer the smallest change that avoids a
   cross-app import.
6. **Submission behavior.** On successful `POST /v1/alfredpay/fiatAccounts`, invalidate the
   relevant `['fiatAccounts', corridorId]` query and `['recipients']` query so the new self-recipient
   appears immediately.
7. **Delete/disable behavior.** Expose deletion only if product wants self-recipient removal in v1.
   If deletion ships, call `DELETE /v1/alfredpay/fiatAccounts/:fiatAccountId` and invalidate the
   same queries. If deletion does not ship, leave no dead UI affordance.
8. **Errors.** Treat `404` from list as "no AlfredPay customer for this country" and show an
   onboarding-required message, not the add-account form. Treat validation/provider errors from
   create as form errors without storing entered bank details locally.

### API / backend notes

- The dashboard service should grow `addFiatAccount(payload)` and, optionally,
  `deleteFiatAccount(fiatAccountId, country)` alongside its existing `listFiatAccounts` wrapper.
- The main plan mentions `GET /fiatAccountRequirements`, but `apps/api` does not currently expose
  that route. Do not depend on it unless it is added in the same change. The widget already uses
  local static field definitions, which are sufficient for the supported v1 methods above.
- The backend stores no local fiat-account table for self recipients; AlfredPay is the source of
  truth. The local recipient list remains derived at read time from `GET /v1/alfredpay/fiatAccounts`.

### Spec updates (same change set — Security Spec Sync)

- `docs/security-spec/05-integrations/alfredpay.md`: document that the dashboard can create/list
  and optionally delete provider-side fiat accounts for the authenticated effective user, and that
  bank-account PII is passed through to AlfredPay but not persisted locally.
- `docs/security-spec/03-ramp-engine/recipient-transfers.md`: clarify that AlfredPay self transfers
  use `additionalData.fiatAccountId` from a provider-side account owned by the sender; third-party
  recipient payout references remain a separate unresolved product path.
- `docs/plans/dashboard-full-product-connection.md`: update §7.1 if the product decision changes
  from "TBD" to "dashboard owns self fiat-account setup only" so it does not imply invited-recipient
  payout capture is solved.

### Verification

- With an approved MX AlfredPay account and no fiat accounts, Recipients shows an "Add Mexico CLABE"
  CTA instead of hiding Mexico entirely.
- Submitting a valid MX CLABE calls `POST /v1/alfredpay/fiatAccounts`, refetches fiat accounts, and
  renders a `self_MX_<fiatAccountId>` recipient.
- Selecting that self-recipient on Transfer includes `additionalData.fiatAccountId` during ramp
  registration.
- Repeat the same happy path for CO, US, and AR with their method-specific fields.
- Failed provider validation does not create a self-recipient and does not persist entered bank
  details in local state after leaving the form.

### Risks / caveats

- The form handles bank-account PII. Keep it client-side only until submit; do not add local DB
  storage, logs, analytics payloads, or notification metadata containing raw account fields.
- The widget form currently carries frontend UI/i18n dependencies. A direct cross-app import is a
  maintenance trap; copy surgically or extract the tiny config/validation layer.
- Multiple fiat accounts per corridor are valid and should stay visible, because each maps to a
  different `fiatAccountId` payout target.
- This solves **self-recipient** AlfredPay payouts. It does not solve invited-recipient payout setup
  or the `recipient_payout_references` verification gate.
