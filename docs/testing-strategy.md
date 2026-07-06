# Testing Strategy

This document describes the test suite architecture for Vortex: what each layer covers, the
infrastructure it runs on, and where to add tests when you change something. It was introduced
together with the shared test harness (`apps/api/src/test-utils`) — see "How to extend" below.

## Goals

1. **Catch regressions before manual testing does.** Critical paths (quote → register → ramp
   execution → payout) are covered by automated tests that run on every PR.
2. **Easy to extend.** Adding a corridor, phase, or endpoint means writing a scenario on top of
   existing factories and fakes — not hand-rolling a new mock setup.
3. **Hermetic by default.** The PR suite needs no secrets, no chain access, and no third-party
   sandboxes. Anything that touches the network is opt-in (`RUN_LIVE_TESTS=1`) and never blocks CI.

## Test layers

| Layer | What | Where | Runner |
|---|---|---|---|
| 1. Unit | Pure logic: helpers, token configs, SDK handlers | each package, next to source | `bun test` (Vitest for frontend) |
| 2. API integration | Real Express + real Postgres + fake external world, driven over HTTP; incl. the quote pricing goldens (`quote-pricing.golden.test.ts`) and the HTTP surface tests (auth OTP flow, webhooks, ramp history, public routes; `http-surface.invariants.test.ts`) | `apps/api/src/tests/` | `bun test` |
| 3. Corridor scenarios | Phase processor end-to-end per corridor against the fake world: BRL onramp (pix→BRLA-on-Base), BRL offramp (USDC-on-Base→pix incl. real Nabla swap + both EVM subsidy phases), CROSS-CHAIN BRL offramp (USDC-on-Polygon→squid→Base→pix incl. user-reported squid-hash verification), MXN on/offramp (spei↔USDT-on-Polygon), CROSS-CHAIN MXN onramp (spei→Polygon mint→squid→USDT-on-Arbitrum incl. real squidRouterSwap/Pay + Arbitrum settlement subsidy), and a USD/COP/ARS matrix over the same Alfredpay rails (happy paths + per-currency limit breaches + per-currency transient AND unrecoverable failures) | `apps/api/src/tests/corridors/` | `bun test` |
| 4. SDK contract | Real SDK against the real API in-process: BRL onramp lifecycle (`sdk-contract.test.ts`), the SELL/user-transaction surface — offramp lifecycle via submitUserTransactions, updateRamp, getQuote, listAlfredpayFiatAccounts (`sdk-contract.offramp.test.ts`) — and the Alfredpay SELL rail: full USD/ach offramp lifecycle plus quote/register shape checks for COP and ARS (`sdk-contract.alfredpay-offramp.test.ts`) | `apps/api/src/tests/sdk-contract*.test.ts` | `bun test` |
| 5. Frontend | XState machine tests, actor tests (register/sign/start/KYC-routing against MSW with mocked wallet seams), component tests (RTL + MSW + mock wagmi) | `apps/frontend/src` | Vitest |
| 6. E2E | Few critical Playwright journeys with a mock wallet | `apps/frontend/e2e/` | Playwright (non-blocking) |

### The invariants the suite protects

Derived from `docs/security-spec/` — these must never regress, and each has dedicated tests:

- A quote is consumed **exactly once**, atomically with ramp registration; it expires after its TTL.
- Fees are fixed at quote creation (`metadata.fees`) and identical at registration time; no
  client-supplied fee is accepted.
- Subsidy caps are enforced (pre-swap, post-swap, `MAX_FINAL_SETTLEMENT_SUBSIDY_USD`) — a breach
  throws instead of paying out (finding F-001). Each of the three caps has an end-to-end breach
  test: pre- and post-swap in `corridors/brl-offramp.scenario.test.ts`, the final-settlement cap
  in `corridors/mxn-offramp.scenario.test.ts`.
- Ownership guards: a partner only sees its own quotes/ramps; a user only their own (F-068 class).
- Phase processor: retries are bounded (`MAX_RETRIES`); after exhaustion of a recoverable error
  the processor stops without a terminal transition, releasing the lock and leaving the ramp
  resumable (the missing `failed` transition is documented as open finding F-004 in
  `docs/security-spec/03-ramp-engine/state-machine.md`). Unrecoverable errors transition to
  `failed`. Locks are released on terminal states; only `currentPhase`/`phaseHistory` are
  updated by the processor.
- Presigned transaction and ephemeral address validation (F-021, F-038 class).
- External swap/route outputs are validated against expectations before funds move (F-030).

When a new security finding is fixed, add a regression test in the same PR and reference the
finding ID in the test name.

## Infrastructure

### The fake external world (`apps/api/src/test-utils/`)

All external boundaries are stubbed at the existing service seams — the singletons the production
code already goes through:

- **Anchors/APIs**: `BrlaApiService` (Avenia), `MykoboApiService`, Alfredpay, SquidRouter,
  price feeds. Each fake is configurable per test: succeed with given amounts, return malformed
  data, time out, or fail N times then succeed (for retry testing).
- **Chains**: faked at the `EvmClientManager` and Pendulum `apiManager` seams with an in-memory
  balance ledger. Phase handlers genuinely poll balances and observe transfers; tests script the
  ledger ("EURC arrives on the ephemeral after the 2nd poll").
- **Clock**: there is no injected clock; expiry tests stay deterministic by writing
  `expiresAt` timestamps in the past instead of faking timers.

Decision: we deliberately do **not** run Anvil/fork-based EVM tests in CI. Fork mode depends on an
upstream RPC (flaky public endpoints or a paid key as a CI secret). If calldata-level fidelity ever
becomes a problem, add a non-blocking nightly Anvil job — do not put it in the PR path.

Decision: Pendulum/AssetHub/XCM ramp corridors are **deliberately not tested**. Vortex no longer
supports those flows as a product; the route strategies and substrate handlers that still
reference them are kept only in case support is re-added later. Do not count them as coverage
gaps and do not build a substrate fake for them — if the flows come back, that is the moment to
add corridor scenarios (and the fake) for them.

### Database

API integration tests run against a real Postgres (Docker locally, service container in CI),
migrated with the production Umzug migrations and truncated between tests. Sequelize is **not**
mocked in integration tests — transactionality (quote consumption, processing locks) is part of
what we test. Unit tests may still mock models where the DB is incidental.

### Factories

`apps/api/src/test-utils/factories.ts` builds `User`, `Partner`, `ApiKey`, `QuoteTicket`,
`RampState`, `TaxId` (Avenia KYC) and `AlfredPayCustomer` (Alfredpay KYC) rows. Never
hand-write these objects or copy JSON snapshots into tests; extend the factory instead.

### Playwright E2E (`apps/frontend/e2e/`)

A handful of critical journeys run against the real frontend in Chromium, hermetically: quote
form → quote displayed, quote error surfaced, wallet gate on offramps, and four full ramp
journeys — the BRL onramp (`onramp-brl-journey.spec.ts`: quote → email/OTP auth → Avenia KYC
gate → registration → in-page ephemeral signing asserted via the presigned txs posted to
`/v1/ramp/update` → Pix payment info → progress → success), the BRL OFFRAMP
(`offramp-brl-journey.spec.ts`: the money-out path — wallet gate + balance check → CPF/Pix
eligibility → registration → USER-WALLET broadcast of the source-of-funds transfer with its
hash reported in a second update → automatic start → success), the MXN onramp
(`onramp-mxn-journey.spec.ts`: the Alfredpay rail — Alfredpay KYC gate → Polygon-side
ephemeral signing → SPEI payment details (CLABE) → success), and the USD OFFRAMP
(`offramp-usd-journey.spec.ts`: Alfredpay money-out — wallet gate on Polygon → Alfredpay KYC
gate → ACH fiat-account selection → ephemeral presigning → user-wallet broadcast with its
hash reported in a second update → automatic start → progress; the success screen is
currently unreachable for Alfredpay offramps — known frontend gap documented in the spec):

- The API origin (`http://localhost:3000`) is intercepted per-test with `page.route`
  (`e2e/support/mockBackend.ts`) — no backend, database, or chain access.
- A mock wallet (`e2e/support/mockWallet.ts`) is injected as an EIP-6963-announced
  EIP-1193 provider before the app loads; wagmi/AppKit picks it up like any installed
  browser wallet.
- Third-party endpoints (SquidRouter token list, WalletConnect config) are blocked; the
  app's built-in fallbacks cover them.

They run nightly via `.github/workflows/e2e.yml` (never PR-blocking) and locally with
`bun test:e2e`.

### EUR re-enablement precondition

EUR ramps are kill-switched at registration (`ramp.service.ts`). The Mykobo (EUR) corridors
currently have **no hermetic coverage** — only `RUN_LIVE_TESTS`-gated sandbox tests. Lifting
the kill-switch is gated on adding a hermetic EUR corridor scenario in
`apps/api/src/tests/corridors/` first (the FakeMykobo anchor in `test-utils/fake-world/`
already covers intents/fees; the scenario harness is the same one the BRL and MXN corridors
use).

### Live tests

Tests that hit real RPCs or sandboxes (e.g. XCM dry-runs in `packages/shared`) are gated behind
`RUN_LIVE_TESTS=1` via `describe.skipIf`. They are for local debugging and optional nightly runs,
never PR-blocking.

## CI

- **PR-blocking** (`ci.yml`): build, Biome, typecheck, then unit + integration tests for every
  workspace. Postgres is provided as a GitHub Actions service container.
- **Non-blocking / nightly**: Playwright E2E journeys and any live smoke tests. Failures alert;
  they don't block merges.
- Every workspace suite carries a coverage ratchet, enforced by `bun run test:coverage` in CI:
  the bun workspaces (shared, sdk, rebalancer, api) produce an LCOV report checked against
  per-package floors by `scripts/check-coverage.ts` (floors live in each `package.json` script);
  the frontend uses vitest's built-in thresholds (`apps/frontend/vitest.config.ts`). Floors sit just under the
  coverage measured when they were last raised — raise them when you add tested code; never lower
  them to make CI pass.
- The coverage denominator is real, testable source only: built bundles, foreign workspace code,
  migrations, generated files (contract ABIs, route tree), Storybook stories, and test
  infrastructure are excluded (each workspace's `bunfig.toml` `coveragePathIgnorePatterns`,
  resp. `coverage.exclude` in the frontend vitest config). If a methodology change like this
  moves the measured numbers, re-base the floors to just under the new values in the same PR —
  that is not "lowering the ratchet".
- `bun run test:coverage` at the repo root runs every workspace's gate and then prints a
  per-area breakdown (`scripts/coverage-report.ts`) showing which parts of each workspace are
  covered and which are not.

## How to extend

- **New endpoint / route change** → add or update an HTTP-level test in `apps/api/src/tests/`.
  If it's auth-protected, add it to the auth-matrix test.
- **New corridor or phase** → add a scenario in `apps/api/src/tests/corridors/` using the
  factories and fake world. Cover: happy path, one transient failure + recovery, one unrecoverable
  failure → `failed`.
- **New external integration** → add a fake for it in `test-utils/fake-world/` with the standard
  configurable behaviors (success / malformed / timeout / fail-then-succeed).
- **SDK-visible API change** → the SDK contract tests in `apps/api/src/tests/sdk-contract.test.ts`
  must pass unchanged, or the change is breaking and needs an SDK release note.
- **New frontend flow** → machine test first (transitions incl. rejection/error paths), component
  test if there's meaningful rendering logic, E2E only if it's a top-level critical journey.
- **Quote/fee logic change** → the pricing goldens in
  `apps/api/src/tests/quote-pricing.golden.test.ts` will diff; update the expected values
  consciously and mention the fee impact in the PR description.

## Commands

```bash
# One-time per machine: dedicated test Postgres (Docker, port 54329)
bun test:db:start         # bun test:db:stop to remove it

# Everything hermetic (what CI runs). NOTE: `bun run test`, not `bun test` —
# a bare `bun test` at the root invokes bun's own runner (the root bunfig.toml
# makes it a no-op instead of letting it pick up stray files).
bun run test              # shared + sdk + rebalancer + api + frontend

# Coverage: all workspace gates + per-area report (needs the test db)
bun run test:coverage

# Browsable HTML version of the same report (per-file, with uncovered line
# ranges) from the lcov files the previous command left behind
bun run test:coverage:html

# Individual workspaces
bun test:api              # unit + integration (needs the test db)
bun test:frontend
bun test:shared
bun test:rebalancer
bun test:sdk

# Playwright E2E journeys (non-blocking; starts its own Vite dev server)
# One-time per machine: cd apps/frontend && bunx playwright install chromium
bun test:e2e

# Opt-in live tests (real RPCs / sandboxes; needs credentials in .env)
cd apps/api && RUN_LIVE_TESTS=1 bun test src/api/services/phases/
```

(Scripts are defined in the root `package.json`; see there for the authoritative list.)
