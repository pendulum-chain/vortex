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

## 2. Skip the second login on the dashboard → widget onboarding hand-off

**Status:** analysis done; strategy not chosen, nothing implemented. **Scope narrowed (2026-07):**
sender onboarding moved back into the dashboard (main plan §6.1), so the sender no longer hits
this hand-off. What remains is the **recipient** hand-off (§6.2) — a recipient arrives from an
invite link with no dashboard session at all, so "skip the second login" only applies if they
already have one. Re-evaluate whether this item is still worth the auth-surface change before
picking a strategy; the analysis below is preserved because it is still correct about origins.

> Note: the adjacent redirect bug is **already fixed**. `onboardingUrl()`
> (`apps/dashboard/src/lib/widget.ts`) previously emitted `${WIDGET_URL}/?kybLocked=<region>`,
> dropping the `/widget` path segment; it now emits `${WIDGET_URL}/widget?kybLocked=<region>`.
> This item is only about the auth re-prompt that remains after that fix.

### Finding

When the dashboard hands a user off to onboard/KYC, it redirects to the widget (the main
frontend app, `§6` of `dashboard-full-product-connection.md`). Both apps authenticate against
the **same** backend (`/v1/auth/*`, Supabase OTP) and store the **same** Supabase JWTs, yet the
widget re-prompts for login on arrival. The dashboard's `AuthService`
(`apps/dashboard/src/services/auth.ts`) is a direct port of the widget's
(`apps/frontend/src/services/auth.ts`), differing only in the storage-key prefix
(`vortex_dashboard_access_token` vs `vortex_access_token`) — deliberately, "so a widget session
on the same origin is never reused."

Neither plan doc addresses this re-login; `§6` treats the hand-off as a plain redirect. This is
a gap.

### The deciding fact: browser storage is per-**origin**, not per-domain

`localStorage` isolation is by origin (scheme + host + port), *not* by registrable domain or
path. Which strategy is even possible depends entirely on how the dashboard is deployed
relative to the widget:

| Deployment | Same origin? | `localStorage` shared? |
| :-- | :-- | :-- |
| **Prod today** — dashboard builds into `apps/frontend/dist/dashboard` and serves at `vortexfinance.co/dashboard/`; widget at `vortexfinance.co/widget` (`apps/dashboard/vite.config.ts` `base: "/dashboard/"`) | **Yes** — path differs only | **Yes, already** |
| **Dev** — dashboard `:5174`, widget `:5173` | No (port differs) | No |
| **Hypothetical** — dashboard on `dashboard.vortexfinance.co`, widget on `vortexfinance.co` | No (host differs) | No |

So **in prod today the session is already in the same `localStorage` the widget reads** — the
only thing between the widget and the dashboard's session is the key prefix. A subdomain split
(or dev) breaks that and forces a cross-origin mechanism.

### Options

Ordered by increasing effort / decreasing coupling to the current bearer-token model. The
right answer depends on the target topology; a full solution likely combines **(A)** for prod
with **(B)** for dev / future subdomains.

- **(A) — Same-origin `localStorage` read-through (prod today).** Have the widget's
  `AuthService.getTokens()` fall back to the dashboard's keys (`vortex_dashboard_*`) when its
  own are empty — one-directional, so the widget adopts a dashboard session but the two
  otherwise stay independent. (Simpler variant: unify the keys into one session — but that
  couples logout across both apps.)
  - **Works:** same origin only (prod path-split, not dev, not subdomains).
  - **Safety:** best available here — nothing transits the URL (no history/`Referer`/log
    exposure) and **zero new attack surface**: the tokens already live in that origin's
    `localStorage`, so XSS exposure is identical to the status quo.
  - **Cost:** a few lines in the widget's `getTokens()`; no backend change.

- **(B) — URL hand-off in the redirect (any origins — dev, subdomain, cross-domain).** Pass
  the session in the redirect URL rather than relying on shared storage. Two flavors:
  - **(B1) Raw tokens in the URL hash** — `${WIDGET_URL}/widget?kybLocked=BR#access_token=…&refresh_token=…`.
    Reuses the widget's **existing** `handleUrlTokens()` primitive
    (`apps/frontend/src/services/auth.ts:117`, wired in `useAuthTokens.ts`), which already reads
    tokens from the hash, calls `supabase.auth.setSession()`, persists them, and scrubs the URL
    via `history.replaceState`. The hash is the correct channel (never sent to the server, not
    in the `Referer` header). **Cost:** minimal, no backend change. **Downside:** the refresh
    token transits the URL for an instant (one history entry before the scrub).
  - **(B2) One-time exchange code** — dashboard requests a short-lived, single-use code from the
    API, redirects with `?code=<code>`, widget exchanges it server-side for a session. **Safest
    URL-based option:** the real token never touches a URL. **Cost:** a small new backend
    endpoint (issue + redeem code) plus a widget exchange call.

- **(C) — httpOnly cookie scoped to the parent domain** (`Domain=.vortexfinance.co`,
  `Secure`, `SameSite=Lax`). The gold standard and the only clean answer if the dashboard
  moves to its own subdomain: set once, sent automatically to every subdomain and path, and a
  top-level redirect between subdomains still carries it (same registrable domain = same-site).
  Most secure overall — the token becomes unreadable to JS, eliminating XSS token theft.
  - **Cost:** a real auth re-platform. Today both apps send bearer tokens from `localStorage`
    in the `Authorization` header; cookies require the API to accept cookie auth and add CSRF
    protection. Only worth it if hardening auth is a goal in its own right, not just to skip a
    second login.

> **Discarded:** iframe / `postMessage` / hidden-iframe storage relay. A full-page redirect has
> no opener to `postMessage` to, and modern browsers partition third-party iframe storage, so
> these are fragile and effectively dead. Not pursued.

### Recommendation

- **If the dashboard stays same-origin (`/dashboard/`):** ship **(A)** for prod + **(B1)** to
  cover dev, behind the existing `onboardingUrl()` / `getTokens()` boundary. No backend change,
  no auth rewrite.
- **If the dashboard moves to a subdomain:** **(A)** no longer works. Choose between **(B2)**
  (keep the bearer model, safest URL hand-off) and **(C)** (re-platform onto cookie sessions).

### Change set (for the recommended (A) + (B1) combo)

1. **Widget `getTokens()` read-through** (`apps/frontend/src/services/auth.ts`): when the widget
   keys are empty, fall back to reading `vortex_dashboard_*` keys. One-directional; do not write
   dashboard keys from the widget.
2. **Dashboard `onboardingUrl()`** (`apps/dashboard/src/lib/widget.ts`): when a live session
   exists, append `#access_token=…&refresh_token=…` to the widget URL (dev / cross-origin path).
   No-op when same-origin read-through already covers it.
3. No new backend surface for this combo.

### Spec updates (same change set — Security Spec Sync)

- `docs/plans/dashboard-full-product-connection.md` `§6`: note that the hand-off carries the
  session (state the mechanism chosen) so the widget does not re-prompt.
- `docs/security-spec/`: document the cross-app session hand-off under the auth/session spec —
  where the session is read from, what (if anything) transits the URL, and the scrub. Whichever
  option ships, the auth surface changed and the spec must say so.

### Verification

- Dashboard → "start onboarding" lands on the widget **already authenticated** (no OTP prompt),
  in both dev (`:5174`→`:5173`) and a same-origin preview build.
- For **(B1)**: after arrival the URL no longer contains the tokens (`history.replaceState`
  scrub ran); the widget session is persisted under `vortex_*` keys.
- Logout semantics are intentional: **(A)** read-through leaves the two independent; unifying
  keys (or **(C)**) logs both out together — confirm the chosen behavior matches intent.

### Risks / caveats

- **(B1)** puts the refresh token in the URL for one history entry before the scrub — acceptable
  (it reuses the already-accepted magic-link path) but strictly worse than **(A)**/**(B2)**;
  prefer it only where shared storage is unavailable.
- Any subdomain change silently disables **(A)**; whoever makes that infra change must
  re-select the strategy, or SSO regresses to a second login.
- **(C)** touches the whole auth model and every authenticated route — not a "skip login" tweak;
  scope it as its own project with CSRF handling if pursued.

---

## 3. Unmock sender onboarding — reuse or port the widget's KYC state machines

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
`FiatToken` and spawns it. The three children differ sharply in how portable they are:

| Machine | Lines | Corridors | `sendParent` | Ramp coupling | Portability |
| :-- | --: | :-- | --: | --: | :-- |
| `alfredpayKyc.machine.ts` | 935 | MX, CO, AR, US | 0 | none | **Directly reusable** — imports only `@vortexfi/shared` types, `AlfredpayService`, `kyc.states` |
| `brlaKyc.machine.ts` | 399 | BR | 0 | 2 refs (`RampContext`) | Light — decouple `RampContext` from its input |
| `mykoboKyc.machine.ts` | 228 | EU | 2 | 2 refs (`RampSigningPhase`) | **Hardest** — `sendParent`s into the ramp machine and requires a `walletAddress` |

Form components alongside them: `components/Avenia/*` (KYC/KYB + liveness) and
`components/Alfredpay/*` (per-country `ArKycFormScreen`, `MxnKycFormScreen`, `ColKycFormScreen`,
plus `KybFormScreen`, `KybBusinessDocsScreen`, `KybPersonDocsScreen`, `FailureKycScreen`).

Note the shape mismatch to close: the dashboard mock has **one** generic `personalInfo` step with
a "Tax ID" field for every corridor, while the widget has **distinct per-country screens**. The
mock's step list is a simplification, not a spec — the widget's screens win.

### The two options

- **(A) — Reuse via a shared package.** Lift `kyc.states.ts` + the three child machines + their
  form components into `packages/` (or a new `packages/kyc`), consumed by both apps. Single
  source of provider logic; fixes land once. **Cost:** `mykoboKyc` `sendParent`s to the ramp
  machine and `brlaKyc` reads `RampContext`, so the ramp coupling must be severed first —
  replace `sendParent` with an injected callback and pass a narrow input type instead of
  `RampContext`. `mykoboKyc` also needs `walletAddress`, which a dashboard sender may not have
  connected; decide whether EU KYC requires a wallet or whether that dependency can be deferred.
- **(B) — Port into the dashboard.** Copy the machines and adapt. Faster to a working EU/BR
  screen, no refactor of the widget's ramp machine. **Cost:** two copies of provider logic that
  will drift; a provider API change must then be fixed twice. Explicitly the outcome §7.1(B)
  calls "the fragmentation we're otherwise avoiding."

**Leaning (A)**, staged: start with `alfredpayKyc` (zero coupling, four corridors — MX/CO/AR/US),
which proves the shared-package shape without touching the ramp machine at all. Then `brlaKyc`
(light). Leave `mykoboKyc` last, since severing `sendParent` and the wallet dependency is the
real work and EU is one corridor.

### Change set (sketch — refine once (A)/(B) is chosen)

1. Sever ramp coupling in `brlaKyc.machine.ts` (narrow input type, drop `RampContext`) and
   `mykoboKyc.machine.ts` (`sendParent` → injected callback). Verify the widget still onboards.
2. Extract the machines + `kyc.states.ts` + form components to the shared location; repoint
   `apps/frontend` imports. **No behavior change** — this step is a pure move, gated on the
   widget's existing KYC tests (`brlaKyc.machine.test.ts`, `alfredpayKyc.machine.test.ts`,
   `mykoboKyc.machine.test.ts`, `validateKyc.actor.test.ts`) passing unchanged.
3. Replace `HeadlessFlow`'s `WizardStepFields` with the real per-country form components; drop
   `headlessOnboarding.machine.ts` in favour of the real machine. Keep `ExternalFlow` for the
   US redirect and EU-company Google Form, which have no provider machine.
4. Delete `useOnboardingOverrideStore` and its overlay in `useActiveAccount` — the corridor card
   then reads real status from `/v1/onboarding/status` alone, and `rejected` becomes reachable.
5. Reconcile `getOnboardingSteps` with the widget's real screen sets (per-country, not generic).

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

- Step 1 edits the widget's live ramp machine. That is a real regression surface on the shipping
  product to unblock a mocked dashboard flow — do it behind the widget's existing tests, and land
  it separately from the dashboard work.
- `alfredpayKyc.machine.ts` is 935 lines and spans MX/CO/AR/US with per-country file-upload
  requirements. "Directly reusable" means *no ramp coupling*, not *small*.
- EU is the corridor where the dashboard and widget disagree most: the dashboard routes company
  KYB to a Google Form, and `mykoboKyc` wants a connected wallet. Resolve EU alongside main plan
  §12.9, not in isolation.
