# PRD: External API contract tests — verifying the fake world against the real one

Status: milestones 1–4 (SquidRouter, Alfredpay, Avenia/BRLA, price feeds) implemented;
milestone 5 (warn-only production parsing) ships separately per endpoint once its schema
has survived a quiet week of nightlies. Methods without production consumers
(`getQuote` on Alfredpay; `createOnchainSwapQuote`/`createOnchainSwapTicket`/
`getMainAccountBalance`/`getAveniaSwapTicket` on Avenia) are deliberately uncovered —
there is no consumed contract to verify.
Reference: extends the test suite described in [`docs/testing-strategy.md`](../testing-strategy.md).

Naming: this layer is called **"external API contracts"** everywhere (docs, directory names,
test titles) to avoid confusion with the existing "SDK contract" layer, which verifies the
opposite boundary (our SDK against our API).

## Problem

The hermetic test suite runs everything against the fake world in
`apps/api/src/test-utils/fake-world/`. The fakes implement the same TypeScript interfaces as the
real clients (`AlfredpayApiService`, `BrlaApiService`, `getRoute`, `priceFeedService`), so fakes
and production code are consistent with each other **by construction**. But nothing verifies that
those TypeScript types match what the partner APIs actually return: the real clients cast
`response.json()` to a type without runtime validation (e.g.
`packages/shared/src/services/alfredpay/alfredpayApiService.ts`), and the fakes are written
against the same unverified types.

Concretely: if Alfredpay renames a response field or adds a new status value, every hermetic test
stays green, TypeScript stays happy, and production breaks — silently, typically as an
`undefined` propagating several phases downstream.

The drift risk is therefore **our shared types/fakes vs. reality**, not "fake vs. real client".

## Goals

1. Detect drift between the shared types (and thus the fakes) and the real partner APIs, within
   one nightly cycle instead of at the next production incident.
2. Define each external contract **once**, as a runtime-checkable artifact (zod schema), instead
   of assertions duplicated between a hermetic suite and a live suite.
3. Verify on every PR that the fakes satisfy the same contract — the "verified fake" pattern.
4. Keep the PR path fully hermetic. Nothing here may add a network dependency, secret, or
   third-party sandbox to PR-blocking CI.

## Non-goals

- **No live corridor scenarios.** The layer-3 scenario tests script the world (balances arriving
  after N polls, statuses flipped on command); that cannot be done against reality. The reusable
  artifact is the service seam, not the scenario suite.
- **No funds movement.** Live tests stop at the point where a sandbox would require a real
  payment (e.g. an onramp stays `AWAITING_PAYMENT`; that is a valid terminal point for the test).
- **No behavioral-equivalence proof.** Webhook ordering, status-transition timing, and which
  intermediate statuses actually occur are not verifiable this way. Residual coverage for that is
  production monitoring — explicitly accepted.
- **No calldata/chain fidelity.** The no-Anvil decision in `testing-strategy.md` stands; the
  EVM/Pendulum fakes sit above calldata level on purpose and get no contract suite.
- **No Mykobo suite** while the EUR corridor is kill-switched (it already has `RUN_LIVE_TESTS`
  sandbox tests; fold them into this pattern only if EUR is re-enabled).
- **No production runtime validation in the test-layer PRs.** Warn-only `safeParse` in the
  production clients ships separately because it touches production code paths — but per
  endpoint and early, not deferred to the end (see Milestone 5): it is the only check that runs
  against production responses.

## Accepted assumption: sandbox ≈ production

Partner sandboxes may be shaky and can deviate from production responses. **We accept this
risk**: behaving like production is what sandboxes are for, and it is the only environment we can
test against without moving real money. Consequences we commit to:

- Live contract results are **never PR-blocking** — they run nightly and alert.
- A live failure is a *signal to triage*, not automatically a bug in our code. Triage order:
  (1) transient sandbox flakiness → rerun; (2) sandbox-only deviation → confirm against
  production logs/traffic before touching anything, then encode the deviation as a documented
  loosening of the schema if it's sandbox-only; (3) real contract change → update schema, types,
  fake, and any affected handler **in the same PR**.
- Network-level failures (timeouts, 5xx, DNS) are reported as **skips with a warning**, not
  contract failures — only a successful response that violates the schema fails the suite. This
  keeps the alert channel meaningful despite shaky sandboxes.

## Design

### The contract: zod schemas in `packages/shared`

For each covered service, add a `schemas.ts` next to its `types.ts`
(e.g. `packages/shared/src/services/alfredpay/schemas.ts`).

**The schemas model the raw wire JSON of the fields we consume** — two boundaries the current
types blur:

- **Wire, not internal.** Schemas describe what `response.json()` actually yields: timestamps are
  `z.string()` (ISO), never `Date`. Some existing types already lie about this (e.g.
  `BaseTicket.createdAt: Date` in `packages/shared/src/services/brla/types.ts` — JSON cannot
  contain a `Date`). Each anchor's milestone resolves such discrepancies for its endpoints:
  either fix the type to the wire shape or add an explicit transform at the client boundary.
  These are pre-existing bugs the schemas surface, not scope creep.
- **Consumed contract, not full partner response.** Schemas cover the fields our code actually
  reads, not everything the partner returns. The fakes are deliberately partial (e.g.
  `FakeSquidRouter` omits `quoteId`, `aggregateSlippage`, `toAmountMin`, `toAmountUSD`, which the
  full `SquidrouterRoute` type requires) — that is correct, and we keep it: validating fields
  nothing consumes would add nightly flake surface with no protective value. Where the consumed
  set is a subset of the shared type, the schema is typed against a derived `Pick` of it.

Each schema is declared with `satisfies z.ZodType<ConsumedShape>`, which catches renames and
removals of consumed fields at compile time. This is a strong guard, **not a proof**: coercions,
`.optional()`, transforms, and `any` can still hide mismatch. Discipline that keeps it honest: no
`z.any()`, no `.optional()` unless the field is genuinely absent in some real responses, no
input-widening coercions in wire schemas.

Schemas cover **response** shapes (that's where drift bites; requests are our own construction).
Assertions are properties, not values: fields present, amounts parse as decimals, statuses ∈
enum, ids non-empty. Never exact amounts, ids, or timestamps — sandbox responses are
non-deterministic.

Unknown extra fields are allowed (loose-object semantics) — partners adding fields is not
drift we care about; partners removing or renaming fields is.

**Dependency decision:** zod is currently a dependency only of `apps/frontend` (`^4.3.6`). Putting
schemas in `packages/shared` makes zod a dependency of shared (and transitively of the api). This
is deliberate and acceptable: the frontend already bundles zod, so browser bundle weight is
unchanged; add it via the root `catalog:` on the same major version the frontend uses.

### The suites: one contract test file per service, two modes

Location: `apps/api/src/tests/contracts/<service>.contract.test.ts` (the fakes live in
`apps/api`, and the api workspace already has the env/preload infrastructure).

Each file has two halves running the **same schema assertions**:

1. **Hermetic half** (default, PR-blocking): instantiate the fake, call each covered method,
   `schema.parse()` the result. Cheap, no network, guarantees the fake never drifts from the
   declared contract.
2. **Live half** (`describe.skipIf(!process.env.RUN_LIVE_TESTS)`): the real client against the
   partner sandbox, same parses. The existing preload already disables the fetch guard and fake
   installation under `RUN_LIVE_TESTS=1`, so this follows the established convention (see the
   Mykobo integration tests). Skips cleanly (with a log line) when the required credentials are
   absent from `.env`.

Where a method's fake output and live output can both be produced, the shared assertion is a
plain function (`assertOnrampQuoteContract(quote)`) called from both halves — no test
parameterization framework needed.

### Sandbox state

Anchor sandboxes are stateful (KYC'd customers, fiat accounts, rate limits). Per anchor:

- Use **pre-provisioned sandbox fixtures** (a KYC-approved test customer, a registered fiat
  account) whose ids live in `.env` alongside the sandbox credentials, documented in
  `.env.example`. Creating these per-run is not worth the flakiness of driving KYC flows in CI.
- Live tests must be **idempotent and cheap**: create quotes freely (they expire), create at most
  one transaction per direction per run, never depend on state left by a previous run.

## Scope and priority

| # | Service | Contract surface (v1) | Live credentials |
|---|---|---|---|
| 1 | SquidRouter | `/v2/route` response shape vs. what `FakeSquidRouter` emits (route tx fields the handlers read: target, value, calldata, estimate amounts, quoteId). The status endpoint is covered hermetically only — a live check needs the hash of a real, recent cross-chain transaction. | none — public API |
| 2 | Alfredpay | `getAllConfigs`, `createOnrampQuote` / `createOfframpQuote` / `getQuote`, `createOnramp` + `getOnrampTransaction` (to `AWAITING_PAYMENT`), `createOfframp` + `getOfframpTransaction`, `listFiatAccounts`, KYC status shapes, the limit-breach **error shape** | sandbox API key + pre-provisioned customer |
| 3 | Avenia (BRLA) | `createPayInQuote` / `createPayOutQuote` / `createOnchainSwapQuote`, `validatePixKey`, ticket creation + `getAveniaPayoutTicket`/`getAveniaPayinTickets` shapes, `getSubaccountUsedLimit`, balances | sandbox key + pre-provisioned subaccount |
| 4 | Price feeds | response shapes for the feeds `priceFeedService` consumes | none/free tier |

**SquidRouter goes first** despite lower business criticality: no secrets, no partner fixtures,
and it proves the whole harness (schema conventions, both suite halves, the nightly job) end to
end in one small PR. Alfredpay (4 currencies × 2 directions, most recent investment) is the first
business-critical anchor and the template for Avenia. Each service is a self-contained milestone.

**Milestone 5 — warn-only production parsing (separate PRs, per endpoint, not deferred to the
end):** the production client `safeParse`s responses through the same schema and logs a
structured, **redacted** warning on mismatch (schema name + failing paths, never response
bodies — they contain PII). This is the only check in the plan that runs against *production*
responses rather than sandbox ones — it is the direct hedge for the sandbox ≈ production
assumption — so an endpoint gets it as soon as its schema has survived a quiet week of
nightlies, rather than after all anchors are done. Promotion from warn to hard `parse` is a
later, per-endpoint decision once prod logs stay quiet. Kept out of the test-layer PRs because it
changes production code paths.

## CI

- **PR-blocking:** only the hermetic halves, which run automatically as part of the existing
  `bun test:api` (they are ordinary tests in `src/tests/`). They count toward the api coverage
  ratchet like any other test.
- **Nightly:** a job running `RUN_LIVE_TESTS=1 bun test src/tests/contracts/` in `apps/api`, with
  sandbox credentials as repository secrets. Non-blocking, failures alert — same policy and
  workflow home as the Playwright nightly (`.github/workflows/e2e.yml` or a sibling
  `contracts.yml`).
- **Skips must not rot silently.** Skip-with-warning on network errors and missing credentials is
  right per-test, but a nightly where *nothing* live actually ran is an outage of the drift
  detector, not a pass. The nightly job sets `CONTRACT_EXPECT_LIVE=1`; under that flag the suite
  fails if zero live assertions executed (e.g. credentials rotted, sandbox down all night), so a
  week of green-but-empty runs is impossible.

## Success criteria

1. A renamed/removed field or a new status value in a sandbox response fails the nightly run with
   an error naming the schema and field — not a green suite and a later production incident.
2. Every fake's output is schema-validated on every PR; a fake edited out of sync with the
   contract fails locally before push.
3. Each external contract exists exactly once (the schema), used by: hermetic half, live half,
   and (Milestone 5) warn-only production parsing.
4. Zero new network dependencies, secrets, or flakiness in PR-blocking CI.
5. `docs/testing-strategy.md` gains a contract-test layer row and a short section, updated in the
   same PR as milestone 1.

## Risks

| Risk | Position |
|---|---|
| Sandbox deviates from production | Accepted (see above). Triage protocol distinguishes sandbox-only quirks from real drift; sandbox-only loosenings are documented in the schema file. |
| Sandbox downtime / flakiness | Network errors → skip-with-warning, not failure. Only schema violations on successful responses fail. |
| Sandbox rate limits | Live suite is small by design (one transaction per direction per anchor per night); quotes only otherwise. |
| Credential rot (expired keys, deleted fixtures) | Missing creds → clean skip with log locally; in the nightly, `CONTRACT_EXPECT_LIVE=1` turns an all-skipped run into a failure, and an invalid-auth response fails loudly — rot is noticed within a day, not months. |
| Schemas drift from TS types | `satisfies z.ZodType<ConsumedShape>` makes renames/removals of consumed fields a compile error. Not a proof — loose schemas (`any`, needless `.optional()`, coercions) can still hide drift; the schema-discipline rules above are the actual guard. |
| False confidence | Contract tests prove shapes, not behavior (timing, webhook ordering, intermediate statuses). Stated as a non-goal; residual risk owned by monitoring. |

## Open questions (resolve during milestone 1)

1. Which sandbox credentials do we already hold (Alfredpay, Avenia), and can a fiat account /
   KYC-approved customer be pre-provisioned in each? (Determines how much of the transaction
   surface the live half can cover.)
2. How far does the Alfredpay sandbox let an offramp progress without a real on-chain deposit?
   (Determines the terminal assertion point for the SELL live test.)
3. Where do nightly failures alert today (the E2E workflow's channel), and does this job reuse it?
