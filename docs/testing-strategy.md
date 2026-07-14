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
| 3. Corridor scenarios | Phase processor end-to-end per corridor against the fake world: BRL onramp (pix→BRLA-on-Base), BRL offramp (USDC-on-Base→pix incl. real Nabla swap + both EVM subsidy phases), CROSS-CHAIN BRL offramp (USDC-on-Polygon→squid→Base→pix incl. user-reported squid-hash verification), MXN on/offramp (spei↔USDT-on-Polygon), CROSS-CHAIN MXN onramp (spei→Polygon mint→squid→USDT-on-Arbitrum incl. real squidRouterSwap/Pay + Arbitrum settlement subsidy), CROSS-CHAIN BRL onramp (pix→Base mint+Nabla swap→squid→USDC-on-Arbitrum), a USD/COP/ARS matrix over the same Alfredpay rails (happy paths + per-currency limit breaches + per-currency transient AND unrecoverable failures + per-currency cross-chain BUY and no-permit cross-chain SELL, incl. MXN SELL cross-chain), and EUR (Mykobo) on/offramp scenarios (SEPA↔EURC/USDC-on-Base incl. real Nabla swap; registration stays kill-switched — see the coverage matrix) | `apps/api/src/tests/corridors/` | `bun test` |
| 4. SDK contract | Real SDK against the real API in-process: BRL onramp lifecycle (`sdk-contract.test.ts`), the SELL/user-transaction surface — offramp lifecycle via submitUserTransactions, updateRamp, getQuote, listAlfredpayFiatAccounts (`sdk-contract.offramp.test.ts`) — and full per-currency lifecycles for all four Alfredpay currencies in both directions: SELL offramp lifecycles for USD/ach, MXN/spei, COP/ach and ARS/cbu (`sdk-contract.alfredpay-offramp.test.ts`) and BUY onramp lifecycles for MXN/spei, USD/ach, COP/ach and ARS/cbu (`sdk-contract.alfredpay-onramp.test.ts`) | `apps/api/src/tests/sdk-contract*.test.ts` | `bun test` |
| 5. Frontend | XState machine tests, actor tests (register/sign/start/KYC-routing against MSW with mocked wallet seams), component tests (RTL + MSW + mock wagmi) | `apps/frontend/src` | Vitest |
| 6. E2E | Critical Playwright journeys with a mock wallet: BRL on/offramp plus parameterized Alfredpay journeys for all four currencies in both directions. The dashboard runs its own Playwright config covering auth, account selection, onboarding/KYC/KYB, recipient invitations, and the MXN offramp transfer journey | `apps/frontend/e2e/`, `apps/dashboard/e2e/` | Playwright (non-blocking) |
| 7. External API contracts | Consumed-contract zod schemas (`packages/shared/src/services/*/schemas.ts`, plus `apps/api/.../priceFeed.schemas.ts`) validated against the fakes (PR-blocking) and against the real partner APIs (live, nightly, non-blocking); SquidRouter, Alfredpay, Avenia/BRLA, CoinGecko | `apps/api/src/tests/contracts/` | `bun test` / nightly `contracts.yml` |

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

## Coverage matrix: corridors × entry points

One row per live corridor and direction. The scenario columns are the **direct-API entry point**
(registration over real HTTP + the real phase processor against the fake world); SDK and E2E are
the other two entry points. Corridor-agnostic invariants (auth matrix, quote consumption/expiry,
fee immutability, pricing goldens, ownership) are not repeated per row — they run once against
shared code and are listed in the invariants section above. **Update this table in the same PR
as any new corridor, rail, or entry-point test.**

The **E2E journey** column tracks the widget (`apps/frontend/e2e/`). The dashboard is a fourth
entry point with its own suite (`apps/dashboard/e2e/`), currently covering MXN SELL only; see the
dashboard Playwright section below rather than reading it out of this table.

Legend: ✅ directly tested · ◐ covered only via shared code/another corridor (see footnote) ·
❌ missing · — not applicable · 🚫 kill-switched.

| Corridor (rail) | Dir | Happy path | Transient | Unrecoverable | Security / caps | Cross-chain leg | SDK | E2E journey |
|---|---|---|---|---|---|---|---|---|
| BRL (Avenia / Pix) | BUY | ✅ | ✅ | ✅ | ✅ recipient | ✅² | ✅ | ✅ |
| BRL (Avenia / Pix) | SELL | ✅ | ✅ | ✅ | ✅ pre/post-swap caps, recipient | ✅ F-021 | ✅ | ✅ |
| MXN (Alfredpay / SPEI) | BUY | ✅ | ✅ | ✅ | ✅ recipient | ✅ settlement subsidy | ✅ | ✅ |
| MXN (Alfredpay / SPEI) | SELL | ✅ | ✅ | ✅ | ✅ calldata, F-001 cap | ✅¹ | ✅ | ✅ |
| USD (Alfredpay / ACH) | BUY | ✅ | ✅ | ✅ | ✅ + limit breach | ✅ | ✅ | ✅ |
| USD (Alfredpay / ACH) | SELL | ✅ | ✅ | ✅ | ✅ + limit breach | ✅¹ | ✅ | ✅ |
| COP (Alfredpay / ACH) | BUY | ✅ | ✅ | ✅ | ✅ + limit breach | ✅ | ✅ | ✅ |
| COP (Alfredpay / ACH) | SELL | ✅ | ✅ | ✅ | ✅ + limit breach | ✅¹ | ✅ | ✅ |
| ARS (Alfredpay / CBU) | BUY | ✅ | ✅ | ✅ | ✅ + limit breach | ✅ | ✅ | ✅ |
| ARS (Alfredpay / CBU) | SELL | ✅ | ✅ | ✅ | ✅ + limit breach | ✅¹ | ✅ | ✅ |
| EUR (Mykobo / SEPA) | BUY | ✅³ | ✅³ | ✅³ | ✅ recipient, KYC gate | ◐⁴ | 🚫 | 🚫 |
| EUR (Mykobo / SEPA) | SELL | ✅³ | ✅³ | ✅³ | ✅ payout-vs-intent match, KYC gate | ◐⁴ | 🚫 | 🚫 |
| AssetHub (BRL BUY → USDC; USDC SELL → Pix) | both | ❌ deferred | ❌ | ❌ | ❌ | — | ❌ | ❌ |

¹ Alfredpay SELL cross-chain is covered on the no-permit fallback path (user-broadcast squid
approve+swap verified against the blueprints by hash); the permit/TokenRelayer variant is
untested — it needs relayer-contract execution the fake world doesn't model.
² BRL BUY cross-chain (pix → Base mint + Nabla swap → squid → USDC-on-Arbitrum) is happy-path
only; failure modes of the shared squid handlers are covered by the MXN cross-chain and BRL
cross-chain offramp scenarios.
³ EUR registration is still kill-switched at `/v1/ramp/register` (503 — asserted by these
tests). The scenarios seed the registered state through the same service calls registration
runs below the switch, then drive the real PhaseProcessor. The re-enablement precondition is
met; once the switch is lifted, swap the seeding helpers in `corridors/eur-*.scenario.test.ts`
to plain HTTP registration and add SDK + E2E coverage.
⁴ The EUR scenarios cover the direct EURC-on-Base paths; BUY to other destinations / SELL from
non-Base sources use the shared squid legs tested in the other corridors' cross-chain variants.

**Gaps at a glance** (everything not ✅ above): the Alfredpay permit/TokenRelayer cross-chain
SELL variant is untested (no-permit fallback is); EUR SDK and E2E entry points stay closed
behind the kill-switch (corridor scenarios are in place, so lifting it is unblocked); the
AssetHub corridors are reachable in production but deliberately deferred (see the decision
note under Infrastructure — revisit if the product keeps them).

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

Critical journeys run against the real frontend in Chromium, hermetically: quote form → quote
displayed, quote error surfaced, wallet gate on offramps, and full ramp journeys — the BRL
onramp (`onramp-brl-journey.spec.ts`: quote → email/OTP auth → Avenia KYC gate → registration
→ in-page ephemeral signing asserted via the presigned txs posted to `/v1/ramp/update` → Pix
payment info → progress → success), the BRL OFFRAMP (`offramp-brl-journey.spec.ts`: the
money-out path — wallet gate + balance check → CPF/Pix eligibility → registration →
USER-WALLET broadcast of the source-of-funds transfer with its hash reported in a second
update → automatic start → success), and the Alfredpay rail parameterized over all four
currencies in both directions — BUY MXN/USD/COP/ARS (`onramp-alfredpay-journeys.spec.ts`:
Alfredpay KYC gate with per-country routing asserted → Polygon-side ephemeral signing →
per-currency payment instructions (SPEI/CLABE, ACH bank details, COP bank details, ARS CVU)
→ success) and SELL USD/MXN/COP/ARS (`offramp-alfredpay-journeys.spec.ts`: wallet gate on
Polygon → Alfredpay KYC gate → per-country fiat-account form (US wire, 18-digit CLABE, COP
ACH, 22-digit CBU) → ephemeral presigning → user-wallet broadcast with its hash reported in
a second update → automatic start → success incl. per-token arrival text):

- The API origin (`http://localhost:3000`) is intercepted per-test with `page.route`
  (`e2e/support/mockBackend.ts`) — no backend, database, or chain access.
- A mock wallet (`e2e/support/mockWallet.ts`) is injected as an EIP-6963-announced
  EIP-1193 provider before the app loads; wagmi/AppKit picks it up like any installed
  browser wallet.
- Third-party endpoints (SquidRouter token list, WalletConnect config) are blocked; the
  app's built-in fallbacks cover them.

They run nightly via `.github/workflows/e2e.yml` (never PR-blocking) and locally with
`bun test:e2e`.

### Playwright E2E — dashboard (`apps/dashboard/e2e/`)

The dashboard has its own `playwright.config.ts` (its own Vite server on port 5174, served under
the `/dashboard/` base path) and its own `e2e/support/mockBackend.ts`, since it consumes a
different set of endpoints than the widget. Covered so far:

- **Login** (`login.spec.ts`): the email/OTP flow incl. a rejected code.
- **Route gate** (`auth-gate.spec.ts`): an unauthenticated deep link redirects to `/login`, a
  seeded session renders the app shell, and an authenticated user is bounced off `/login`.
- **Onboarding / KYC** (`onboarding-alfredpay-mxn.spec.ts`): real Alfredpay MX individual KYC end
  to end — add the corridor, create the customer, fill the form, upload the ID documents, reach
  the "In review" screen. Three variants cover how approval surfaces, which is the part the
  dashboard wires (the machine itself is unit-tested in `packages/kyc`): (a) approval arrives while
  the wizard stays open and the machine's own status poll advances it to "Approved"; (b) the user
  clicks "Continue in background" and the corridor card flips to approved with no reload, purely
  via the onboarding-status refetch — the KYC machine is gone by then; (c) the wizard is dismissed
  mid-review and reopened, resuming into "In review" and then approval. Approval timing is driven
  deterministically: the mock's route handlers are Node closures, so the spec flips a `kyc.approved`
  flag between assertions and the browser's next poll observes it.
- **Transfer** (`transfer-mxn-journey.spec.ts`): the money path — a SELL offramp of USDC-on-Polygon
  to an MXN payout account. Approved MX corridor → auto-selected self-recipient from the saved
  Alfredpay fiat account → quote → registration with fresh ephemeral keypairs → in-page ephemeral
  signing asserted via the raw EIP-1559 txs posted to `/ramp/update` → USER-WALLET broadcast of the
  `squidRouterNoPermitTransfer` with its hash reported in a second update → `/ramp/start` → status
  polling to a terminal phase while the form navigates to `/transactions`. A second test pins
  payout-account selection: the mock serves two saved fiat accounts, and choosing the non-default
  one must register against *that* `fiatAccountId` — a broken selector would pay the wrong account.

Notes:

- Specs other than the login one skip the OTP walk by seeding the session directly into
  `localStorage` (`e2e/support/session.ts`) — `useAuthStore` reads it at module init. The login
  spec asserts the flow writes exactly that session, so the shortcut cannot drift from reality.
- The register fixture's transactions are **all EVM txs on `network: "polygon"`** on purpose:
  `src/machines/transfer.actors.ts` opens a real WebSocket RPC for any ephemeral tx on Pendulum,
  Hydration, or a substrate-format Moonbeam tx.
- `src/lib/wagmi.ts` uses `http()` with no URL, so viem falls back to per-chain public RPCs. Both
  are genuinely reached: Polygon (the user transaction's receipt is awaited through the wagmi
  transport, not the wallet stub) and Ethereum mainnet (ConnectKit's ENS lookup after connect).
  They are answered by a JSON-RPC responder in `e2e/support/mockBackend.ts`.
- Hermeticity is enforced, not assumed. A catch-all route aborts every request outside the app
  origin that is not in `THIRD_PARTY_BLOCKLIST` (WalletConnect/Reown, ConnectKit's Family probe,
  the Coinbase Wallet SDK, Google Fonts), and unmatched API paths 404. Both lists are recorded and
  asserted empty, so a new endpoint or a changed default RPC URL fails the suite instead of
  silently reaching the network.
- **Not covered**: the Avenia KYC liveness step, which redirects to an external Avenia-hosted page
  and cannot complete hermetically (the same limitation as the widget's BRL onramp); the
  permit/TokenRelayer cross-chain SELL variant, which needs relayer-contract execution the mock
  does not model; and the overview/recipients/transactions tables.

### EUR re-enablement precondition

EUR ramps are kill-switched at registration (`ramp.service.ts`). The hermetic EUR corridor
scenarios this precondition asked for now exist (`corridors/eur-onramp.scenario.test.ts`,
`corridors/eur-offramp.scenario.test.ts` — both directions, happy path + transient +
unrecoverable, driving the real PhaseProcessor; they also pin the 503 the kill-switch
returns). What remains before EUR can be re-enabled: lift the switch, swap the scenarios'
state-seeding helpers to plain HTTP registration (each file's docstring says how), and add
SDK contract + E2E journey coverage for the reopened entry points.

### Live tests

Tests that hit real RPCs or sandboxes (e.g. XCM dry-runs in `packages/shared`) are gated behind
`RUN_LIVE_TESTS=1` via `describe.skipIf`. They are for local debugging and optional nightly runs,
never PR-blocking.

### External API contracts (`apps/api/src/tests/contracts/`)

The fakes and the production code share TypeScript types, but nothing else verifies those types
against what partners actually return — the real clients cast `response.json()` unvalidated. The
contract suites close that gap (full design: `docs/features/contract-tests.md`): per service, a
zod schema in `packages/shared/src/services/<service>/schemas.ts` models the raw wire JSON of the
**consumed** fields, and the same schema is parsed against the fake's output (hermetic, part of
the PR-blocking api suite) and against the real partner API (`RUN_LIVE_TESTS=1`, nightly
`contracts.yml`, non-blocking).

Sandbox shakiness is priced in: an error from the live call itself is *inconclusive*
(warn + skip); only a successful response that violates the schema fails. The nightly sets
`CONTRACT_EXPECT_LIVE=1`, which fails a run where zero live calls completed, so credential rot or
a dead endpoint alerts within a day instead of rotting as green. Covered: SquidRouter (`/v2/route`
live; the status endpoint only hermetically — it needs a real recent transaction hash), Alfredpay
(configs, quotes both directions, the trade-limit 409 error shape live with credentials only;
order creation/polling, fiat accounts and KYC status live behind pre-provisioned sandbox fixtures,
see `.env.example`), Avenia/BRLA (quotes live with credentials only; limits/balances/account-info,
pix-key validation and PIX pay-in ticket creation/listing behind a sandbox subaccount fixture;
payout tickets hermetically only — creating one live would move funds), and the CoinGecko
`simple/price` feed (schema in `apps/api/src/api/services/priceFeed.schemas.ts` — the price fake
patches above the HTTP seam, so its hermetic half is fixture-based). Client methods with no
production consumers are deliberately uncovered. Next per the PRD: milestone 5, warn-only
production parsing per endpoint after a quiet week of nightlies.

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

# Dashboard auth journeys (own config + Vite server on 5174)
# One-time per machine: cd apps/dashboard && bunx playwright install chromium
bun run test:e2e:dashboard

# Opt-in live tests (real RPCs / sandboxes; needs credentials in .env)
cd apps/api && RUN_LIVE_TESTS=1 bun test src/api/services/phases/

# Live external API contract checks (SquidRouter needs no credentials)
cd apps/api && RUN_LIVE_TESTS=1 bun test src/tests/contracts/
```

(Scripts are defined in the root `package.json`; see there for the authoritative list.)
