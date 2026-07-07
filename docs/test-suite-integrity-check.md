# Test-Suite Integrity Check — Agent Brief

You are auditing the test suite of this repository (branch `test-suite-foundation`) for
**integrity**: does it actually deliver what it was built to deliver? Do not trust any
documentation, commit message, or code comment — verify every claim empirically. Where a claim
is false, broken, or only partially true, say so plainly. You are the last gate before this
branch is merged and relied upon.

## The goals this suite was built for

The owner's original requirements — everything below must be judged against these:

- **(a) Easy to maintain and extend** — adding a corridor/endpoint/flow means composing existing
  factories and fakes, not hand-rolling mocks; conventions are documented and consistently used.
- **(b) Best practices for similar projects** — hermetic by default, deterministic, one obvious
  command to run everything, enforced in CI, live/networked tests strictly opt-in.
- **(c) Catches real regressions** — if someone breaks a security invariant or an API contract,
  a test fails. Tests that cannot fail are defects.

## What was claimed to be delivered (verify each)

1. **Strategy & docs**: `docs/testing-strategy.md` (architecture, commands, how-to-extend),
   `docs/test-audit-findings.md` (57 confirmed defects in pre-existing tests + remediation log).
2. **Hermetic API harness** in `apps/api/src/test-utils/`: env-neutralizing preload (via
   `apps/api/bunfig.toml`, incl. `root = "src"`), dockerized test Postgres (port 54329,
   `bun test:db:start`), model factories, fake external world (EVM ledger at the
   `EvmClientManager` seam, BRLA/Avenia, Mykobo, Alfredpay, SquidRouter `getRoute`, price feeds,
   Supabase auth), global **fetch guard** that rejects any un-faked external HTTP call, in-process
   Express app (`test-app.ts`).
3. **Invariant tests** (`apps/api/src/tests/`): auth/credential matrix, ramp & quote ownership,
   quote lifecycle (expiry, consumed, foreign-user, flow-variant, EUR kill-switch), and **atomic
   quote consumption** (two concurrent registrations → exactly one ramp).
4. **Corridor scenarios** (`apps/api/src/tests/corridors/brl-onramp.scenario.test.ts`): real
   `PhaseProcessor` over pix→BRLA-on-Base with viem-signed presigned txs — happy path, transient
   failure + retry, wrong-recipient rejection (security regression), concurrent-lock behavior.
5. **SDK ↔ API contract tests** (`apps/api/src/tests/sdk-contract.test.ts`): the real SDK from
   `packages/sdk/src` driving the in-process API (quote → register → sign → start → status),
   plus negative cases (missing secretKey, foreign ramp → typed 403).
6. **Frontend**: 62+ XState machine tests (`apps/frontend/src/machines/*.machine.test.ts`),
   RTL+MSW component tests (Onramp/Offramp quote forms, `ProgressPage`, Avenia KYC fields; infra
   under `apps/frontend/src/test/`), Playwright journeys in `apps/frontend/e2e/` with an EIP-6963
   mock wallet, wired as **non-blocking nightly** (`.github/workflows/e2e.yml`).
7. **CI** (`.github/workflows/ci.yml`): a `test` job with a Postgres service container (port
   54329) running shared, sdk, rebalancer, api and frontend suites on every PR, after
   `bun build:shared`.
8. **Audit remediation**: no process-wide `mock.module`/singleton patches without restore; live
   integration tests' module-level patching gated behind `RUN_LIVE_TESTS`; stale suites either
   rewritten (webhook-delivery) or fixed/removed (see the findings doc's remediation section —
   verify it reflects reality after the follow-up sessions).

## Phase 1 — Everything runs green (foundation, do first)

From a clean checkout state (note anything that only works because of leftover local state):

```bash
bun install
bun test:db:start                # docker Postgres on 54329
bun run build                    # must pass (CI parity)
bun run verify && bun run typecheck
bun test                         # root aggregate: shared, sdk, rebalancer, api, frontend
```

- `cd apps/api && bun test` must exit 0 **as one process**. Record pass/skip/fail counts.
  Run it **twice in a row** (state bleed check) and confirm identical results.
- `cd apps/frontend && bunx vitest run` must pass. Playwright: run if browsers are installed
  (`bunx playwright test`), otherwise verify the config/workflow wiring and say you didn't run it.
- Verify `git status` stays clean after test runs (no JSON snapshots or scratch files churned).
- Verify the skip count is fully explained: every skipped test must be either a
  `RUN_LIVE_TESTS`-gated live test or a documented quarantine with a pointer to
  `docs/test-audit-findings.md`. Unexplained skips are findings.

## Phase 2 — Hermeticity and isolation

1. **No network escapes**: run the api suite with verbose logs and grep for
   `Hermetic test violation` — occurrences must only be *deliberate* assertions/warn-paths, never
   silent besides-the-point failures. Inspect `fetch-guard.ts` for holes (WebSockets are NOT
   covered by it — verify nothing in the hermetic suite opens chain WS connections; check
   the SDK contract test's NetworkManager handling specifically).
2. **Credential safety**: confirm `apps/api/src/test-utils/preload.ts` neutralizes every
   credential a local `.env` could carry that the hermetic suite might otherwise use (Mykobo,
   BRLA, Alfredpay, Supabase, signing seeds). Cross-check against `apps/api/.env.example` for
   any credential-bearing var NOT overridden — each one is a potential leak; assess it.
3. **DB safety**: `db.ts` must refuse non-`test` database names; truncation must exclude
   `SequelizeMeta`. Confirm tests cannot reach the dev database even with a populated `.env`.
4. **Mock isolation**: search all `*.test.ts` for `mock.module(` and module-scope singleton
   patches (`X.getInstance =`, `Model.<static> =`, `global.<x> =`, `prototype.<x> =`). Every one
   must either (i) be restored in `afterAll` from a **value copy captured before mocking** (not a
   live ESM namespace), or (ii) sit behind `if (process.env.RUN_LIVE_TESTS)`. Also verify the
   canary (`aaa-leak-probe.test.ts`) still exists and passes.
5. **Order independence (sampled)**: pick ~8 api test files spanning directories and run each
   standalone (`bun test <file>`) — results must match their full-suite behavior.
6. **dist/ discovery**: confirm `apps/api/bunfig.toml` has `[test] root = "src"` and that
   `bun test` executes no file under `dist/` (check the run's file list).
7. **Live-test gating**: with `RUN_LIVE_TESTS` unset, confirm the four phase integration tests
   and shared XCM dry-runs skip AND execute no module-level patching (the guards around their
   `mock.module`/model patches).

## Phase 3 — Mutation checks: can the tests actually fail?

This is the core of the integrity check. For each mutation: apply it, run ONLY the named test
scope, confirm at least one test **fails for the right reason**, then revert with
`git checkout -- <file>` and re-run to green. Never leave a mutation in place; verify
`git status` is clean at the end of this phase.

| # | Mutation (production code) | Expected failing tests |
|---|---|---|
| 1 | `ramp.service.ts`: make `consumeQuote` not filter on `status = 'pending'` (or skip the `affectedRows === 0` throw) | quote-consumption invariants (concurrent double-register) |
| 2 | `ramp.service.ts`: remove the `quote.status !== "pending"` rejection | "rejects an already-consumed quote" |
| 3 | `ramp.service.ts`: remove the expiry check | "rejects an expired quote" |
| 4 | `destination-transfer-handler.ts`: make `validateDestinationTransferRecipient` a no-op | corridor scenario "wrong recipient" (security regression) |
| 5 | `ownershipAuth.ts`: make `assertRampOwnership` return without checking `ramp.userId` | auth invariants ownership tests |
| 6 | `apiKeyAuth.helpers.ts`: skip the `isActive`/expiry check in `validateSecretApiKey` | revoked/expired API key tests |
| 7 | `phase-processor.ts`: don't release the lock in the `finally` | corridor happy-path lock assertions |
| 8 | API response shape: rename a field the SDK reads in `getRampStatus`'s response (service level) | `sdk-contract.test.ts` |
| 9 | `ramp.machine.ts` (frontend): break one transition target the machine tests cover | the corresponding machine test |
| 10 | `webhook-delivery.service.ts`: change the signature header name or signing input | rewritten webhook-delivery tests |

If any mutation survives (no test fails), that is a **high-severity finding**: name the missing
assertion and where it should live.

## Phase 4 — Goal-level assessment (a/b/c)

- **(a) Maintainability**: write (temporarily) a tiny new test using the harness — e.g. a new
  invariant test hitting one endpoint via `startTestApp` + factories. Time/effort should be
  minutes with zero new mocking. Delete it afterward. Judge the "How to extend" section of
  `docs/testing-strategy.md` for accuracy: follow it literally and note every place it lies.
- **(b) Best practices**: single command (`bun test`) works; CI blocks on it; live tests opt-in;
  no watch-mode surprises in CI paths; deterministic (no `Date.now`-sensitive flakes — check the
  quote-expiry tests' clock handling); reasonable runtime (api suite target: well under a minute).
- **(c) Regression net coverage** — verify a test exists (and locate it) for each security-spec
  invariant; flag any without one as a gap:
  quote consumed exactly once/atomically; quote expiry; fee structure present & used for status
  (fees immutable path); ownership (user/partner/anonymous, ramps AND quotes); credential matrix
  (missing/invalid/malformed/revoked/expired); admin vs metrics-dashboard secrets; EUR
  kill-switch behavior; presigned-tx recipient & signer validation; phase-processor lock
  acquire/release + terminal states + retry exhaustion; ephemeral freshness check; webhook
  signing/delivery/retry; SDK response-shape contract; frontend ramp/KYC machine error paths.

## Phase 5 — Known deliberate gaps (confirm they are still true, documented, and acceptable)

These were consciously descoped — confirm each is documented (strategy doc or findings doc), and
flag if any has silently grown in importance:

- No golden/snapshot tests for quote **pricing math** (fee amounts for a fixed input matrix).
  Check whether anything equivalent exists now; if not, it remains the top recommended addition.
- Only the BRL corridor has processor-level scenarios (EUR is kill-switched; Mykobo corridors are
  covered by gated live tests only; Alfredpay corridors have no hermetic scenario).
- Substrate/Pendulum chain interactions are not faked (the ApiManager fake serves only inert
  reads); XCM flows have no hermetic coverage.
- No Anvil/fork EVM tests (deliberate: upstream-RPC flakiness in CI).
- No coverage-percentage gate (deliberate for now).
- Rebalancer has unit tests only (no scenario harness).

## Report format

Produce a single report, most severe first:

1. **Verdict** — one paragraph: does the suite deliver (a), (b), (c)? Merge-ready?
2. **Broken claims** — anything documented/claimed that is not true (file:line, how verified).
3. **Mutation results** — table: mutation → failed as expected? → notes. Highlight survivors.
4. **Hermeticity/isolation findings** — leaks, escapes, order dependence, credential exposure.
5. **Coverage gaps** — invariants without a failing-capable test.
6. **Deliberate-gap review** — still acceptable? Any promoted to "should fix now"?
7. **Confirmed-good summary** — what you verified works, with the numbers (pass/skip counts,
   runtimes), so this report is also a record of the suite's state at audit time.

Rules: read production code before judging a test wrong; verify empirically before reporting;
one mutation at a time and always revert; leave the working tree exactly as you found it
(`git status` clean, test DB left running).
