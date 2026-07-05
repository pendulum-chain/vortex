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
| 1. Unit | Pure logic: helpers, token configs, quote/fee golden tests, SDK handlers | each package, next to source | `bun test` (Vitest for frontend) |
| 2. API integration | Real Express + real Postgres + fake external world, driven over HTTP | `apps/api/src/tests/` | `bun test` |
| 3. Corridor scenarios | Phase processor end-to-end per corridor against the fake world | `apps/api/src/tests/corridors/` | `bun test` |
| 4. SDK contract | Real SDK against the real API in-process | `packages/sdk/test/contract/` | `bun test` |
| 5. Frontend | XState machine tests, component tests (RTL + MSW + mock wagmi) | `apps/frontend/src` | Vitest |
| 6. E2E | Few critical Playwright journeys with a mock wallet | `apps/frontend/e2e/` | Playwright (non-blocking) |

### The invariants the suite protects

Derived from `docs/security-spec/` — these must never regress, and each has dedicated tests:

- A quote is consumed **exactly once**, atomically with ramp registration; it expires after its TTL.
- Fees are fixed at quote creation (`metadata.fees`) and identical at registration time; no
  client-supplied fee is accepted.
- Subsidy caps are enforced (pre-swap, post-swap, `MAX_FINAL_SETTLEMENT_SUBSIDY_USD`) — a breach
  throws instead of paying out (finding F-001).
- Ownership guards: a partner only sees its own quotes/ramps; a user only their own (F-068 class).
- Phase processor: max-retry exhaustion transitions to `failed` (F-004), locks are released on
  terminal states, only `currentPhase`/`phaseHistory` are updated by the processor.
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
- **Clock**: quote expiry and timeout logic accept an injected clock in tests.

Decision: we deliberately do **not** run Anvil/fork-based EVM tests in CI. Fork mode depends on an
upstream RPC (flaky public endpoints or a paid key as a CI secret). If calldata-level fidelity ever
becomes a problem, add a non-blocking nightly Anvil job — do not put it in the PR path.

### Database

API integration tests run against a real Postgres (Docker locally, service container in CI),
migrated with the production Umzug migrations and truncated between tests. Sequelize is **not**
mocked in integration tests — transactionality (quote consumption, processing locks) is part of
what we test. Unit tests may still mock models where the DB is incidental.

### Factories

`apps/api/src/test-utils/factories/` builds `Partner`, `ApiKey`, `QuoteTicket`, `RampState`
(per corridor/phase), and presigned-tx fixtures. Never hand-write these objects or copy JSON
snapshots into tests; extend the factory instead.

### Live tests

Tests that hit real RPCs or sandboxes (e.g. XCM dry-runs in `packages/shared`) are gated behind
`RUN_LIVE_TESTS=1` via `describe.skipIf`. They are for local debugging and optional nightly runs,
never PR-blocking.

## CI

- **PR-blocking** (`ci.yml`): build, Biome, typecheck, then unit + integration tests for every
  workspace. Postgres is provided as a GitHub Actions service container.
- **Non-blocking / nightly**: Playwright E2E journeys and any live smoke tests. Failures alert;
  they don't block merges.
- No coverage-percentage gate for now. Coverage may be reported for visibility; ratchets can come
  later once the suite is trusted.

## How to extend

- **New endpoint / route change** → add or update an HTTP-level test in `apps/api/src/tests/`.
  If it's auth-protected, add it to the auth-matrix test.
- **New corridor or phase** → add a scenario in `apps/api/src/tests/corridors/` using the
  factories and fake world. Cover: happy path, one transient failure + recovery, one unrecoverable
  failure → `failed`.
- **New external integration** → add a fake for it in `test-utils/fakes/` with the standard
  configurable behaviors (success / malformed / timeout / fail-then-succeed).
- **SDK-visible API change** → the SDK contract tests in `packages/sdk/test/contract/` must pass
  unchanged, or the change is breaking and needs an SDK release note.
- **New frontend flow** → machine test first (transitions incl. rejection/error paths), component
  test if there's meaningful rendering logic, E2E only if it's a top-level critical journey.
- **Quote/fee logic change** → the golden quote tests will diff; update the snapshots consciously
  and mention the fee impact in the PR description.

## Commands

```bash
# One-time per machine: dedicated test Postgres (Docker, port 54329)
bun test:db:start         # bun test:db:stop to remove it

# Everything hermetic (what CI runs)
bun test                  # shared + sdk + rebalancer + api + frontend

# Individual workspaces
bun test:api              # unit + integration (needs the test db)
bun test:frontend
bun test:shared
bun test:rebalancer
bun test:sdk

# Opt-in live tests (real RPCs / sandboxes; needs credentials in .env)
cd apps/api && RUN_LIVE_TESTS=1 bun test src/api/services/phases/
```

(Scripts are defined in the root `package.json`; see there for the authoritative list.)
