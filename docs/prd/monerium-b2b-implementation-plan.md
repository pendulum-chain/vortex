# Implementation Plan: Monerium B2B Zero-Touch Onramp

**Date:** 2026-07-17
**Basis:** [B2B variant](./monerium-eur-usdc-onramp-b2b-variant.md) (as updated 2026-07-17) + [re-review dispositions](#5-re-review-dispositions-for-the-b2b-build) below
**Deferred parameters:** every placeholder value in this plan is tracked in the [deferred-decisions registry](./monerium-onramp-deferred-decisions.md) — implementation does not block on them.

**Locked scope decisions (2026-07-17):** B2B variant first (consumer flow is phase 2, out of this plan). Fallback address mandatory (single tier). Whitelabel API directly, developed against sandbox during MSA negotiation. Adversarial review parallel to implementation.

## 1. Deliverables overview

| # | Deliverable | Where |
|---|---|---|
| D1 | `contracts/` Foundry package: `VortexForwarder` implementation + `VortexForwarderFactory` + tests (unit, mainnet-fork, invariant) | new top-level `contracts/` (not a bun workspace) |
| D2 | Backend: Monerium whitelabel service + persistent account/deposit/execution models + keeper | `apps/api` |
| D3 | Ops: config manifest publication + verifier script, monitoring/alerts, runbooks | `contracts/script`, `apps/api`, docs |
| D4 | Terms inputs: disclosure texts, penny-test + dormancy runbook | docs (with G2/partner) |
| D5 | Parallel adversarial review of spec + code | review agent round |

## 2. Contract architecture (D1)

### 2.1 Topology

Each client needs their **own address** (the IBAN links to it), so per-client contracts are unavoidable. Pattern: **EIP-1167 minimal proxies** (clones) of an immutable `VortexForwarder` implementation, deployed via `VortexForwarderFactory` (CREATE2, deterministic addresses), initialized atomically in the deploy transaction.

```text
VortexForwarder (implementation, immutable):
  immutables (implementation-level): EURE, EURC, USDC, ROUTER, PATH params, ORACLE,
    ORACLE_DECIMALS, MAX_ORACLE_AGE, SLIPPAGE_BPS, MAX_FEE_BPS, FEE_RECIPIENT,
    ATTESTOR, GUARDIAN (Vortex ops), FACTORY, MIN_SWAP_FLOOR, CAP_CEILING,
    SWEEP_DELAY, TRIGGER_DELAY, LINK_HASH, [RECOVERY_HASH — pending T1]
  per-clone storage (set once by factory in deploy tx):
    destination, fallbackAddress, feeBps, initialized
  mutable state: strandedSince (R03 marker), accountPaused (guardian OR fallback), 
    destination (fallback-updatable), fallbackAddress (fallback-updatable)
```

### 2.2 Functions

- `initialize(destination, fallbackAddress, feeBps)` — factory-only, once, in the deploy tx. `feeBps ≤ MAX_FEE_BPS`; `destination`, `fallbackAddress` nonzero, mutually distinct from token/router/oracle addresses.
- `isValidSignature(bytes32 hash, bytes sig)` — returns magic value iff `hash == LINK_HASH` and `sig` is the ATTESTOR's signature over `keccak256(address(this), LINK_HASH)` (plus, pending T1, the analogous check for `RECOVERY_HASH`). Everything else fails.
- `poke()` — permissionless; records `strandedSince = block.timestamp` iff EURe balance ≥ minSwapAmount and `strandedSince == 0`. Cleared on successful swap or balance dropping below threshold. This is the enforceable start time for both delayed mechanisms (fixes R03 for this build).
- `swapAndForward()` — callable by GUARDIAN/keeper any time, or **anyone** once `strandedSince` is older than TRIGGER_DELAY. Atomic: oracle-checked `minOut` (PRD v2 §7.3 math verbatim), contract-constructed `exactInput` calldata (pinned path, recipient = self), exact approval + reset, delta checks, fee skim (pilot 0), full USDC balance → `destination`. Reverts as a unit (blacklisted destination ⇒ funds stay EURe).
- `sweepStrandedEure()` — permissionless once `strandedSince` older than SWEEP_DELAY; transfers full EURe balance to `fallbackAddress` (never `destination` — CEX rule).
- `fallbackOnly` functions: `setDestination`, `setFallbackAddress`, `setAccountPaused(bool)`, `sweep(token, to)` (any token incl. EURe/USDC/unsolicited — R09).
- `guardianOnly`: `setAccountPaused(bool)` per clone (compliance holds, dormancy gate — R05) and factory-level `setGlobalPaused(bool)`. Guardian pause is protective-only: it can never move funds, change config, or block `fallbackOnly` functions (fallback sweep/exit must work even when paused — invariant).
- Operational params (`minSwapAmount`, `perSwapCap`) live on the factory, guardian-settable within immutable floor/ceiling (R10 invariant table in the contract spec).

### 2.3 Invariants (audit targets, adapted from PRD v2 + re-review)

1. Assets leave a clone only via: swap (router, minOut-checked, output to self), USDC→`destination`, fee ≤ feeBps→FEE_RECIPIENT, EURe→`fallbackAddress` (delayed sweep), or `fallbackOnly` sweep. Exhaustive.
2. No delegatecall, no selfdestruct, CALL only, `value == 0`, reentrancy-guarded, safe-ERC20.
3. `isValidSignature` validates at most the two whitelisted hashes; neither authorizes asset movement by Vortex.
4. Guardian powers are delay-only; fallback powers are client-only; nothing is Vortex-upgradeable.
5. `strandedSince` cannot be manipulated to skip delays (monotonic per stranding episode; reset only by swap success/balance drop).

## 3. Backend (D2)

New `apps/api` module (not the one-shot ramp state machine), per PRD v2 §11 adapted:

- **Models:** `MoneriumAccount` (profileId, iban, forwarderAddress, configVersion, status), `FiatDeposit` (moneriumOrderId unique, mint tx `(chainId, txHash, logIndex, blockHash)`, amounts, compliance status), `ConversionExecution` (includedDepositIds, eureIn/usdcGross/fee/usdcNet, txHash, status).
- **Whitelabel client:** profile creation, corporate KYB submission (mechanism pending T3 — build against sandbox, abstract the KYB step), address link (`POST /addresses` with attestor signature), IBAN issuance, webhook ingestion. Auth-layer abstracted; sandbox first.
- **Webhooks:** HMAC over raw bytes, constant-time compare, **durable persist before 200** (R06), webhook-ID dedup, forward-only status transitions.
- **Attribution (R04):** an execution record snapshots the EURe balance and the set of `FiatDeposit`s with mint block ≤ execution block that are not yet allocated; allocation pro-rata, floor 6 dp, remainder to largest deposit. Deposits discovered later join the next execution. On-chain balance = safety source; order IDs = accounting source. Per-forwarder serialization via Postgres advisory lock.
- **Keeper:** mint detection (webhook + Transfer watcher), `poke()` submission, `swapAndForward()` via private orderflow, nonce management, stale-tx replacement, retries with alerting.
- **Dormancy gate (R05):** backend job pauses accounts (guardian per-clone pause) after P5 days without a successful forward; unpause on partner re-confirmation.
- **Notifications:** after N confirmations with block-hash re-verification; correction path on reorg.

## 4. Phases

- **Phase 0 — G0 spike (parallel with Phase 1):** whitelabel sandbox E2E: deploy forwarder (testnet), attestor-sign link, `POST /addresses`, verify Monerium's EIP-1271 validation passes, mint test EURe, observe. Chainlink EUR/USD weekend behavior (T2). Router pin + EURC hop fee tiers (P10). Reproducible liquidity baseline. **Send T1 question to Monerium tech now.**
- **Phase 1 — Contracts:** D1 complete with fork tests against real pools (incl. V1-token poisoning tests) and invariant/fuzz suite on §2.3. Exit: green suite + spec-code adversarial review round (D5) started.
- **Phase 2 — Backend:** D2 against sandbox; integration tests with mocked/sandbox Monerium; manifest publication + verifier (R01: documented as consistency evidence, not a trust root).
- **Phase 3 — Ops + terms:** monitoring (association changes at Monerium, executable-depth quotes, stranded balances, dormancy), runbooks (incident pause, 02:00-UTC vulnerability, penny test), disclosure/terms drafts to G2 + partner.
- **Phase 4 — Gates + pilot:** G1 written package, G2 sign-off, G3 audit, then G4 invite-only pilot (fee 0, conservative caps).

Phases 0–2 are engineering-internal and start immediately; 3 runs alongside; 4 depends on externals.

## 5. Re-review dispositions for the B2B build

The re-review (R01–R12) targeted the consumer PRD v2; dispositions here cover the B2B build. The consumer flow re-review response is deferred to phase 2 (out of scope of this plan).

| ID | Disposition (B2B) | Resolution |
|---|---|---|
| R01 | Accept | Manifest + verifier ship (D3) but are documented as consistency evidence with no independent trust root; S0 claim in variant doc already scoped to "detectable, not prevented". No cryptographic fix claimed |
| R02 | N/A here | No passkeys in the B2B flow. Owned by consumer phase 2 |
| R03 | Accept — resolved | `strandedSince` poke marker (§2.2) gives both delayed mechanisms an enforceable on-chain start time |
| R04 | Accept — resolved | Snapshot-based allocation rule + advisory-lock serialization (§3) |
| R05 | Accept — resolved | Per-clone guardian pause in contract state (§2.2), protective-only invariant; dormancy gate and compliance holds build on it |
| R06 | Accept — resolved | Durable webhook persistence before 200 (§3) |
| R07 | Accept | Fallback-initiated config changes (destination/fallback updates) are evented; verifier treats owner-authorized changes as expected state transitions, not incidents |
| R08 | N/A here | No opaque owner signatures — no user keys. The analogous surface (fallback-address key compromise) is disclosed in client terms (client self-custody responsibility) |
| R09 | Accept — resolved | `fallbackOnly sweep(token, to)` handles unsolicited tokens; unsolicited USDC is swept to destination with the next forward (documented); accounting treats non-Monerium EURe inflows as unattributed (flagged, not allocated to deposits) |
| R10 | Accept — resolved | §2.3.4/§2.2 role + parameter bounds table is part of the contract spec; audit target |
| R11 | Accept | "Always exit" language replaced: exit guarantees are scoped to fallback-key availability + issuer backstop (best-effort pending T1) |
| R12 | Accept | This plan + updated variant doc are the normative spec for the B2B build; the PRD v2 appendix format stays as-is for the consumer flow |

## 6. What this plan deliberately defers

Everything in the [registry](./monerium-onramp-deferred-decisions.md): fee value, all timing/size parameters (P1–P10), T1–T5 clarifications, G1 written package, G2 legal, partner terms. None block Phases 0–2.
