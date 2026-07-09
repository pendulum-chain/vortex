# Dashboard follow-up plan

Deferred, non-blocking work items surfaced while wiring the dashboard to the real
backend. Each item is self-contained: it states the finding, the rationale, the concrete
change set, and how to verify. Nothing here is started yet — this is the queue, not a diff.

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

## 2. Unmock sender onboarding — reuse or port the widget's KYC state machines

**Status:** decided in principle (reuse over re-implement); reuse-vs-port not chosen; nothing
implemented. **This is the highest-priority dashboard follow-up** — see main plan §12.8.

### Finding

Sender onboarding now lives in the dashboard (main plan §6.1), but every screen is a mock. The
wizard renders the right steps and fields, and **submits nothing**:

- `WizardStepFields.tsx` — uncontrolled `Input`s, no form state, no schema, no validation. Its
  own header comment says "Visual-only mock fields… Nothing is submitted."
- `DocumentDropzone.tsx` — renders a dropzone; no file is read or uploaded ("demo — no file is
  sent").
- `headlessOnboarding.machine.ts` / `externalOnboarding.machine.ts` — the
  `verifying → in_review → approved` tail is `setTimeout` (`VERIFY_DELAY` 1600ms, `REVIEW_DELAY`
  2800ms). No provider is ever called. `rejected` is **unreachable** from either machine.
- `useOnboardingOverrideStore` (`stores/onboardingOverride.store.ts`) — a session-only overlay
  so the corridor card advances despite `GET /v1/onboarding/status` never seeing the submission.
  **Delete this store as part of this work**; it exists only to make the mock coherent.

The widget already has the real thing, wired to the real provider endpoints. Re-implementing it
in the dashboard would fork provider logic across two apps — the fragmentation the main plan
rejects in §7.1(B).

### What exists in the widget

Orchestrator `apps/frontend/src/machines/kyc.states.ts` (259 L) picks a child machine by
`FiatToken` and spawns it. All three import the frontend's provider services (see below); they
differ in how much *ramp* coupling sits on top of that:

| Machine | Lines | Corridors | `sendParent` | Ramp coupling | Extra work to lift |
| :-- | --: | :-- | --: | --: | :-- |
| `alfredpayKyc.machine.ts` | 935 | MX, CO, AR, US | 0 | none | **None beyond service injection** — go first |
| `brlaKyc.machine.ts` | 399 | BR | 0 | 2 refs (`RampContext`) | Narrow the input type off `RampContext` |
| `mykoboKyc.machine.ts` | 228 | EU | 2 | 2 refs (`RampSigningPhase`) | **Hardest** — `sendParent` → callback, and it requires a `walletAddress` |

Form components alongside them: `components/Avenia/*` (KYC/KYB + liveness) and
`components/Alfredpay/*` (per-country `ArKycFormScreen`, `MxnKycFormScreen`, `ColKycFormScreen`,
plus `KybFormScreen`, `KybBusinessDocsScreen`, `KybPersonDocsScreen`, `FailureKycScreen`).

Note the shape mismatch to close: the dashboard mock has **one** generic `personalInfo` step with
a "Tax ID" field for every corridor, while the widget has **distinct per-country screens**. The
mock's step list is a simplification, not a spec — the widget's screens win.

### Packaging is not the blocker — coupling is

The obvious framings are "move it to `packages/shared`" and "leave it in the frontend and import
the file." **Neither works as stated**, and the reason is the same for both: the machines reach
for the frontend's module-scoped HTTP layer.

**Why "just import from `apps/frontend`" is not available.** `vortex-frontend` is `private: true`
with **no `exports` and no `main`** — it is not resolvable as a package. `apps/dashboard`'s
`tsconfig.json` aliases only `@/*` → `./src/*`, and `apps/dashboard/package.json` does not depend
on it. Enabling it needs either an `exports` map on an *application* package or a cross-app Vite
alias plus tsconfig path. Nothing in this monorepo has an app importing from another app, and the
dashboard's own precedent went the other way: `transfer.machine.ts` was **copied** from the
widget's ramp machine (main plan §9), and that copy will drift.

**Why "move to `packages/shared`" does not work either, yet.** The four machines directly import:

| Import | Why it blocks a move |
| :-- | :-- |
| `../services/api`, `alfredpay.service`, `mykobo.service` | The **frontend's** provider services |
| `../services/api/api-client` | Module-scoped, carries the frontend's auth |
| `../services/signingService` | A `.tsx` module |
| `../hooks/brla/useKYCForm`, `useKYBForm` | `KYCFormData`/`KYBFormData` are `z.infer` types, but written as **value** imports from React hook modules — a bundler drags `react-hook-form` + the zod schemas |
| `./types` (`RampContext`), `sendParent` | Couples to the ramp machine |

The api-client point is the sharp one. `apps/dashboard/src/services/api/api-client.ts` (106 L) is
already a trimmed copy of the frontend's (176 L) — same single-flight refresh, same `Bearer`
header. The HTTP layer is **already forked**, so a machine that imports `AlfredpayService` at
module scope silently binds to whichever app it was compiled against.

`packages/shared` is also the wrong home even after decoupling: it carries `@polkadot/api` /
`stellar-sdk` peer deps and is DTO/util-shaped. Adding XState machines and React form components
there makes every consumer inherit that graph.

### Proposal: decouple in place, then extract to `packages/kyc`

1. **Decouple first, inside `apps/frontend`.** Pass the provider service as machine `input`
   instead of importing it. Replace `mykoboKyc`'s two `sendParent` calls with an injected
   `onPhaseChange` callback. Narrow `brlaKyc`'s input so it stops reading `RampContext`. Convert
   the `KYCFormData`/`KYBFormData` imports to `import type`. **This is the whole job** — once the
   machines take their dependencies as input, where the files live is mechanical.
2. **Then extract to a new `packages/kyc`** — a sibling package with `xstate` and `react` as peer
   deps, the shape `packages/sdk` already models. Not `packages/shared`.
3. **Each app injects its own api-client.** That is the seam that lets one copy of the provider
   logic serve two apps with two auth paths.

**Staging.** Start with `alfredpayKyc`: zero ramp coupling, zero `sendParent`, and it covers four
of six corridors (MX, CO, **AR**, US). It proves the package shape without touching the widget's
live ramp machine at all. Then `brlaKyc` (two `RampContext` refs). Leave `mykoboKyc` last —
severing `sendParent` *and* the `walletAddress` dependency is the real work, for a single corridor
that is blocked on the EU question anyway (main plan §12.9).

### Change set (sketch — refine when step 1 lands)

1. **Injection seam, in `apps/frontend`.** Give each machine a provider-service dependency via
   `input` rather than a module import; replace `mykoboKyc`'s `sendParent` with an injected
   callback; narrow `brlaKyc`'s input off `RampContext`; make the brla form-data imports
   `import type`. Widget behavior unchanged.
2. **Extract to `packages/kyc`** (`xstate` + `react` as peers): `kyc.states.ts`, the three child
   machines, `actors/brla/*`, and the `Avenia*` / `Alfredpay*` form components. Repoint
   `apps/frontend` imports. **Pure move, no behavior change** — gated on the widget's existing KYC
   tests (`brlaKyc.machine.test.ts`, `alfredpayKyc.machine.test.ts`, `mykoboKyc.machine.test.ts`,
   `validateKyc.actor.test.ts`) passing unchanged.
3. **Dashboard consumes it**, injecting `apps/dashboard/src/services/api/api-client.ts`. Replace
   `HeadlessFlow`'s `WizardStepFields` with the real per-country form components; drop
   `headlessOnboarding.machine.ts` in favour of the real machine. Keep `ExternalFlow` for the US
   redirect and EU-company Google Form, which have no provider machine.
4. Delete `useOnboardingOverrideStore` and its overlay in `useActiveAccount` — the corridor card
   then reads real status from `/v1/onboarding/status` alone, and `rejected` becomes reachable.
5. Reconcile `getOnboardingSteps` with the widget's real screen sets (per-country, not generic:
   `ArKycFormScreen` / `MxnKycFormScreen` / `ColKycFormScreen`, not one shared `personalInfo`).
6. Consider collapsing the two forked `api-client.ts` copies once both apps inject the same
   interface — out of scope here, but this work is what makes it possible.

### Spec updates (same change set — Security Spec Sync)

The dashboard becomes a second origin submitting KYC/KYB PII and documents to the provider
endpoints. `docs/security-spec/05-integrations/{brla,alfredpay,mykobo}.md` must record that the
dashboard is now a caller, and `01-auth/*` must cover which principal the submission is attributed
to (dashboard session vs. widget session for the same `customer_entity`).

### Verification

- Widget KYC/KYB behavior is **unchanged**: its existing machine tests pass without edits after
  the extract/decouple steps.
- A dashboard sender completes BR KYC end-to-end and `GET /v1/onboarding/status` reports the real
  provider status — with `useOnboardingOverrideStore` deleted, so nothing can fake it.
- A provider rejection surfaces `rejected` on the corridor card (unreachable in the mock).

### Risks / caveats

- Step 1 edits the widget's live ramp machine (for `mykoboKyc`/`brlaKyc`). That is a real
  regression surface on the shipping product to unblock a mocked dashboard flow — do it behind the
  widget's existing tests, and land it separately from the dashboard work. `alfredpayKyc` avoids
  this entirely, which is why it goes first.
- `alfredpayKyc.machine.ts` is 935 lines and spans MX/CO/AR/US with per-country file-upload
  requirements (AR additionally uploads a selfie). "No ramp coupling" means *easy to lift*, not
  *small to review*.
- EU is the corridor where the dashboard and widget disagree most: the dashboard routes company
  KYB to a Google Form, and `mykoboKyc` wants a connected wallet. Resolve EU alongside main plan
  §12.9, not in isolation.
- The extraction moves React form components into a package. Confirm the i18n boundary before
  step 2: the `Alfredpay*` / `Avenia*` screens call the frontend's translation hooks, so either
  the package takes a translator as a prop or `packages/kyc` owns its own message catalog.
