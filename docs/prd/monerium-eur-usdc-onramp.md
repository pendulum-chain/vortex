# PRD: Quoteless EUR → USDC (Ethereum) Onramp via Monerium Whitelabel

**Version:** 2.0 (response to [architecture review](./monerium-eur-usdc-onramp-architecture-review.md); v1 in git history)
**Status:** Revised draft — awaiting re-review and external gates (§13)
**Date:** 2026-07-13
**Owner:** Vortex team

**Changes since v1 (for the re-reviewer):**

- Trust model rewritten as scoped guarantees per lifecycle stage; the absolute "Vortex can never redirect funds" claim is retracted (F01, F02, F17).
- Monerium control-plane authority (`PATCH /ibans/{iban}` on bearer auth alone) verified against live docs and added as launch gate G1 (F01).
- One-signature claim corrected: provisioning is a trusted step, made verifiable via a published configuration manifest; no cryptographic-consent claim (F02, F03).
- Module topology fixed: one immutable singleton with Safe-keyed configuration, atomic initialization, Safe-only mutation (F04).
- Automatic EIP-1271 redeem validator **removed from v1**; recovery redesigned around a mandatory independent recovery owner (F05, F11).
- Keeper-supplied route calldata removed: the module constructs Uniswap calldata internally; generic router registry removed from v1; instant pause vs. timelocked expansion (F06).
- CoW removed from the "same interface" claim; deferred to a separate v2 specification (F07).
- ERC-4337 removed from v1 entirely; rescue path is plain `execTransaction` (F18, F05).
- Backend redesigned around persistent `MoneriumAccount` / `FiatDeposit` / `ConversionExecution` models with idempotency and per-Safe serialization; does not reuse the one-shot ramp state machine (F08, F13).
- Oracle math specified with raw-unit pseudocode, explicit USDC/USD assumption, weekend policy (F09).
- Fee finalized structurally: `feeBps` in per-account config (pilot = 0), immutable `MAX_FEE_BPS` and treasury in the singleton; I1 updated (F10).
- Liquidity caps reframed as availability parameters; `minOut` is the safety condition; reproducible measurement + monitoring required (F12).
- Incident, migration, compliance, dust, and destination-edge sections added (F14, F15, F16).
- Failure-mode corrections applied, incl. atomic-revert behavior on blacklisted destination (F17).
- Filled review response table embedded as Appendix A.

---

## 1. Summary

Vortex adds a new onramp: a user onboards once, receives a **dedicated virtual IBAN** (issued by Monerium under Vortex's whitelabel integration) linked to a **user-owned Safe** on Ethereum. EUR wired to that IBAN is minted as EURe into the Safe and automatically converted to USDC and forwarded to a **destination address fixed at onboarding** — no per-transfer quote, signature, or interaction.

**Security posture (honest version):** this design does *not* claim Vortex can never touch user funds. It provides **scoped guarantees per lifecycle stage** (§4): before mint, Vortex and Monerium are trusted parties with defined, monitored, contractually constrained authority; after mint, an immutable on-chain policy limits Vortex's authority to executing a fixed conversion, pausing it, and tuning bounded availability parameters — it cannot redirect minted principal outside the enumerated policy, under the stated assumptions.

## 2. Scope (reduced v1)

**In scope:**

- Personal Monerium profiles only; **newly onboarded users only** (legacy migration deferred).
- Ethereum mainnet only.
- One swap route: EURe V2 → EURC → USDC via one pinned Uniswap v3 router; calldata constructed by the module.
- One destination per account, set at onboarding; changeable only by the Safe's owners.
- Explicit minimum deposit and processing SLA (§10.3).
- Mandatory independent recovery owner (§8).
- Zero on-chain fee for the pilot; fee structure finalized in the contract regardless (§9).

**Out of scope for v1** (each requires its own future spec): offramp/automated redeem, CoW or any aggregator, ERC-4337, corporate profiles, legacy-user migration, other chains, per-transfer destinations, memo-routing features.

## 3. Verified external facts

Re-verify all before build; dates note when checked.

- **Monerium link message** (2026-07-13): fixed string `"I hereby declare that I am the address owner."`; smart-contract accounts validated via on-chain EIP-1271 `isValidSignature(bytes32,bytes)`; contract must be deployed at validation time (no ERC-6492 documented); linking is per-chain. Redeem orders also accept EIP-1271. ([docs.monerium.com/oauth/#eip-1271](https://docs.monerium.com/oauth/#eip-1271))
- **Monerium control plane** (2026-07-13, **F01 verified**): `PATCH /ibans/{iban}` — "Move an existing IBAN to a specified address an chain. All incoming EUR payments will automatically be routed to the address on that chain." Authorization: **API client bearer token only**; no signature from the currently linked address. `POST /addresses` requires a signature only from the **new** address's owner. Consequence: whoever holds Vortex's whitelabel credentials can redirect future mints. Memo-based routing was **not** found in current docs (review's sub-claim unconfirmed). ([docs.monerium.com/api](https://docs.monerium.com/api))
- **Safe passkeys**: WebAuthn credentials as Safe owners via Safe's WebAuthn signer contracts; Ethereum mainnet has the EIP-7951 P-256 precompile since Fusaka (Dec 2025). Exact signer contracts, addresses, and gas to be pinned and benchmarked in spike G0.
- **Liquidity snapshot** (2026-07-10; see methodology caveat §7.4): no meaningful direct EURe/USDC pool on Ethereum. Route: EURe/EURC Uniswap v3 0.05% (`0x2a817bd5018f9782f84398067639230121e07d4c`, ~$104k TVL — bottleneck) → EURC/USDC 0.05% (`0x95dbb3c7546f22bce375900abfdd64a4e5bd73d6`, >$5M TVL). Aggregator quotes: ~spot at 10k EURe; ~3.6% impact at 50k via pure AMM. These are **snapshots, not durable bounds** (F12).
- **EURe V2 (Ethereum)**: `0x39b8B6385416f4cA36a20319F70D28621895279D`. V1 (`0x3231Cb...273f`) is deprecated; several stale V1 pools still show TVL and must be excluded from routing and tests.

## 4. Trust model — scoped guarantees by lifecycle stage

Replaces v1 §4/§8.3. Every user-facing security claim must be traceable to one row.

| Stage | Guarantee | Trusted dependencies | Vortex's authority | Excluded / residual |
|---|---|---|---|---|
| **S0 Provisioning** (onboarding) | Deployed account configuration is **verifiable** against a published manifest before first deposit; fraud is detectable, not cryptographically prevented | Vortex frontend + backend + deployment path at time of onboarding; Safe & signer contracts as audited | Full (Vortex constructs the account) | A compromised provisioning pipeline can deploy a hostile account. Mitigation: manifest + independent verifier (§6.4); no cryptographic consent claim is made (F03) |
| **S1 Fiat ingress** (bank → Monerium → mint) | Deposits mint to the linked Safe **while the IBAN association is unchanged**; association changes are monitored and alarmed | Monerium (regulated EMI); **Vortex's Monerium API credentials** (F01) | Can re-associate the IBAN via `PATCH /ibans` (bearer token only) → redirect *future* mints, absent Monerium-side controls (gate G1) | Monerium insolvency/compliance action; credential theft. Mitigations: G1 contractual/technical pinning, credential isolation (HSM/scoped tokens if available), continuous association monitoring + user alert + pause |
| **S2 On-chain conversion** (EURe in Safe → USDC) | Under assumptions A1–A4 (below): minted assets cannot leave the Safe except (a) into the fixed swap returning ≥ `minOut` USDC to the Safe, (b) USDC to `destination`, (c) fee ≤ `feeBps` (pilot 0) to the immutable treasury. Max adverse extraction per swap relative to the oracle model = slippage margin + configured fee | Chainlink EUR/USD (A1); EURe/EURC/USDC token contracts behave as modeled, incl. issuer powers (A2); audited Safe + module code (A3); USDC/USD ≈ 1 within the slippage margin (A4) | Execute the fixed policy; pause instantly; tune availability params within immutable bounds (§7.3); nothing else | Oracle compromise, stablecoin depeg beyond margin, token-issuer freeze/blacklist, undiscovered contract bugs. Not covered: unrelated assets/approvals the user adds to the Safe (§7.2) |
| **S3 Delivery** | USDC reaches `destination` exactly as forwarded | Destination remains valid, non-blacklisted, and accessible to the user | None (cannot change destination) | Destination attestation is legal, not cryptographic (§6.3); exchange address rotation, blacklisting (§10.4) |
| **S4 Recovery / exit** | The user can always exit with assets using their owners (passkey and/or recovery owner) without Vortex's API, given public tooling + any funded relayer | User retains ≥1 owner credential; Ethereum RPC access | None (cannot block `execTransaction`) | Passkey RP-ID depends on Vortex's domain (§8.2); loss of **all** owner credentials strands user-initiated actions (automation continues) |

**Liveness vs. safety:** Vortex can always *fail to act* (keeper down, pause engaged, Monerium relationship terminated). Liveness failures leave funds as EURe in the user's Safe (S2) or as unminted fiat claims at Monerium (S1); they do not move assets.

## 5. End-to-end flows

### 5.1 Onboarding

1. Vortex-branded KYC (personal profiles only), submitted to Monerium via whitelabel API; approval via webhook.
2. **Passkey creation.** RP ID = Vortex's apex domain (pinned in docs); credential required to be discoverable and backup-eligible (enforced via WebAuthn `residentKey: required`, attestation-checked where possible). Documented explicitly: sync is typical, not guaranteed (F17.5).
3. **Recovery owner setup (mandatory, F11).** User chooses: second passkey on another device, an existing EOA/hardware wallet, or a **printable one-time recovery key** (EOA generated client-side, shown once, never stored by Vortex). Safe owners = [WebAuthnSigner, recoveryOwner], threshold 1.
4. **Destination collection.** Validation per §10.4; user attests ownership of the destination (checkbox + legal language — this is *legal consent*, not cryptographic proof; F03).
5. **Atomic deployment** via canonical Safe components (§6.1): proxy factory → Safe setup with a minimal audited setup library that enables `VortexSwapModule` and calls `initialize(destination, feeBps)` in the same transaction. Vortex pays gas.
6. **Manifest publication + verification (§6.4).** Onboarding halts unless the independent verifier confirms the deployed account matches the manifest.
7. **The Monerium link signature**: passkey signs the fixed link message; validated via the Safe's EIP-1271 (CompatibilityFallbackHandler → WebAuthn signer). This is the single signature the *flow* requires; the recovery setup may involve its own ceremony. "One signature" is a UX goal for the Monerium step, not a security claim (F03).
8. Vortex calls `POST /addresses` (chain: ethereum); Monerium issues the IBAN.
9. **Disclosure screen**: fee rule, rate basis (Chainlink EUR/USD ± slippage bound), minimum deposit, processing SLA, weekend behavior, failure behavior, S0–S4 trust summary in plain language.

### 5.2 Steady-state deposit

1. User wires EUR (SEPA / SEPA Instant) to their IBAN. Monerium mints EURe (V2) to the Safe.
2. Backend ingests the Monerium webhook (HMAC-verified, deduplicated; §11.2) and/or the on-chain Transfer watcher; records a `FiatDeposit`.
3. Keeper calls `swapAndForward(safe)` (§7.1) under a per-Safe database lock; submits via private orderflow (Flashbots Protect).
4. On confirmed execution: record `ConversionExecution`, allocate output to deposits (§11.4), notify the user with amounts and tx hash (notification correction path per §11.3).

### 5.3 Exit and recovery

- Any owner (passkey or recovery owner) can execute arbitrary Safe transactions via plain `execTransaction` — withdraw, disable the module, change `destination`, or sign a Monerium redeem order (EIP-1271). No ERC-4337 in v1: Vortex relays owner-signed transactions and pays gas; **independently**, any funded account can submit `execTransaction` with valid owner signatures.
- **Disaster-recovery package (mandatory deliverable, F11):** public, versioned tooling that reconstructs the account from chain data + manifest, produces the WebAuthn assertion under the correct RP ID (requires the RP domain — see §8.2), builds and submits `execTransaction` against any RPC, without any Vortex service. Tested in CI against a fork.
- **Passkey loss:** automation continues (keeper needs no user signature); the recovery owner restores user control. Loss of **both** owners: automation still delivers future deposits to `destination`; stranded EURe (paused route) is unrecoverable — disclosed at onboarding.

## 6. Account provisioning

### 6.1 Components (exact pins required before audit)

- Canonical Safe v1.4.1: singleton, `SafeProxyFactory`, `CompatibilityFallbackHandler` — pinned by address **and runtime hash** in the manifest schema. No custom factory; deployment uses `createProxyWithNonce` + a minimal audited `VortexSetupLib` (delegatecalled from Safe `setup`) whose only job is `enableModule` + `module.initialize` (F04 Q4: the custom surface is one small library, not a factory).
- Safe WebAuthn signer contracts (shared verifier or per-user signer proxy — decide in G0 with gas benchmarks; EIP-7951 path preferred).
- Fallback handler is the canonical `CompatibilityFallbackHandler` **only** (needed for EIP-1271 link validation). No 4337 module, no custom handlers (F05, F18).

### 6.2 `VortexSwapModule` topology (F04 — Option B)

One immutable singleton deployment; per-Safe configuration in storage.

```solidity
// Immutable (constructor): EURE, EURC, USDC, UNISWAP_ROUTER, ORACLE, ORACLE_DECIMALS,
//   MAX_ORACLE_AGE, SLIPPAGE_BPS, MAX_FEE_BPS, FEE_RECIPIENT, PATH (EURe -0.05%- EURC -0.05%- USDC),
//   MIN_SWAP_FLOOR, CAP_CEILING, LIVENESS_FALLBACK_DELAY
// Storage:
//   struct Config { address destination; uint16 feeBps; uint64 initializedAt; bool userPaused; }
//   mapping(address safe => Config) config;
//   Ops params (bounded): minSwapAmount ∈ [MIN_SWAP_FLOOR, ...], perSwapCap ∈ [..., CAP_CEILING];
//   globalPaused; guardian (Vortex ops multisig); paramTimelock.
```

- `initialize(destination, feeBps)`: callable once per Safe, **only** with `msg.sender == safe` (holds during atomic setup: the setup library runs in the Safe's context and the module sees the Safe proxy as caller). `feeBps ≤ MAX_FEE_BPS`. Reverts on re-init. Not front-runnable: config is keyed by `msg.sender`, so only the Safe can create its own entry.
- `setDestination(addr)` / `setUserPaused(bool)`: `msg.sender == safe` only (i.e., an owner-signed Safe transaction). `feeBps` immutable after init.
- Every mutation emits events with a config version counter (F04, F14).

### 6.3 Destination semantics

Set at onboarding, part of the manifest and the disclosure. Changeable only via the Safe (S3). Ownership attestation is legal, not cryptographic — requiring a signature from the destination key would contradict the wallet-less UX and is explicitly not claimed (F03).

### 6.4 Configuration manifest and verification (F02)

Per account, a versioned JSON manifest: chain ID; Safe address; singleton + proxy factory + fallback handler addresses and runtime hashes; owners and threshold; enabled modules; module address, runtime hash, and full config (destination, feeBps); signer contract coordinates; oracle and router addresses; setup tx hash. Published to a public transparency log (repo + API). An **independent verifier** (open-source script, runnable by anyone against public RPC) checks live chain state against the manifest; onboarding blocks on it, and it re-runs continuously with alerting. This makes provisioning fraud *detectable before first deposit* — the claim stops there.

## 7. Conversion policy (on-chain)

### 7.1 `swapAndForward(safe)`

Caller: authorized keeper set; **permissionless fallback** — anyone may call once the Safe's EURe balance has exceeded `minSwapAmount` for longer than `LIVENESS_FALLBACK_DELAY` (proposal: 24h). Timing-grief within the slippage bound is accepted and bounded (F06 Q, review §6.4).

Atomic sequence (reverts as a unit; reentrancy-guarded; all external calls `CALL` with `value == 0`; safe-ERC20 handling for return values):

1. Require: not `globalPaused`, not `userPaused`, config initialized.
2. `balance = EURE.balanceOf(safe)`; require `balance ≥ minSwapAmount`; `amountIn = min(balance, perSwapCap)`.
3. Compute `minOut` (§7.3).
4. Via `execTransactionFromModule` (CALL only): `EURE.approve(UNISWAP_ROUTER, amountIn)` (force-approve pattern).
5. Via `execTransactionFromModule`: `UNISWAP_ROUTER.exactInput({path: PATH, recipient: safe, amountIn, amountOutMinimum: minOut})` — **calldata constructed entirely by the module** (F06); path, router, recipient hard-pinned; deadline semantics per the pinned router version (SwapRouter takes an explicit deadline — set `block.timestamp`; SwapRouter02 omits it — decide at pin time in G0).
6. Verify: EURe allowance to router == 0 (reset if router pulled less; then also verify EURe delta == amount actually swapped), `usdcDelta = USDC.balanceOf(safe) − pre ≥ minOut`.
7. `fee = usdcDelta × feeBps / 10_000` → `FEE_RECIPIENT` (pilot: 0); remaining full USDC balance → `config.destination`. If the destination transfer reverts (e.g. Circle blacklist), **the whole execution reverts and funds remain EURe** (F17.1).
8. Emit `SwapExecuted(safe, amountIn, usdcOut, fee, roundId)`.

Scope statement (F06): the guarantee covers **EURe and USDC in a dedicated Safe provisioned by this flow**. Assets or approvals the user independently adds to the Safe are outside the policy's protection (the module never touches them, but a future user-granted allowance is the user's own act).

### 7.2 What was removed (F06, F07)

No keeper-supplied calldata, no selector allowlists, no generic router registry, no aggregators, no CoW. Route governance in v1 is binary: the single pinned route can be **paused instantly** by the guardian (protective, instant) ; any expansion (new route/module version) is a new deployment + per-user owner-authorized migration (§12) — i.e., additions are maximally slow, removals are instant.

### 7.3 Oracle math (F09)

```text
(roundId, answer, , updatedAt, ) = ORACLE.latestRoundData()
require(answer > 0 && updatedAt != 0)
require(block.timestamp − updatedAt ≤ MAX_ORACLE_AGE)        // immutable ceiling
// EURe: 18 dec; ORACLE_DECIMALS: read once at deploy (expect 8); USDC: 6 dec
// scale = 10^(18 + ORACLE_DECIMALS − 6)  → 10^20 for an 8-dec feed
minOut = mulDiv(amountIn, uint256(answer) × (10_000 − SLIPPAGE_BPS),
                10 ** (12 + ORACLE_DECIMALS) × 10_000)        // floor; conservative direction, error < 1 unit
```

- **A4 stated:** USDC/USD is assumed 1.0; the SLIPPAGE_BPS margin absorbs both stablecoin bases. USDC below the margin ⇒ swaps revert (protective). No USDC/USD feed in v1 (documented decision; revisit if margin proves tight).
- **Weekend policy:** Chainlink FX feeds hold the last market price outside trading hours. Verify in G0 whether heartbeat updates continue (staleness passes) or stop (swaps revert Fri→Mon). If they continue: execute normally — the slippage margin has historically absorbed weekend EUR/USD gaps — but keeper policy defers swaps above a size threshold to market hours; disclosed. If they stop: deposits queue until Monday; SLA disclosure reflects it.
- Loss statement (F09): *the swap cannot deliver less than `(1 − SLIPPAGE_BPS)` of the oracle-model value, assuming an honest oracle and modeled token behavior.* This is not a principal bound under oracle or stablecoin failure (see S2 assumptions).

### 7.4 Liquidity: measurement, caps, monitoring (F12)

- `minOut` is the **safety** condition. `perSwapCap` / `minSwapAmount` are **availability** parameters (bounded by immutable floor/ceiling; lowering instant, raising behind the ops timelock).
- Launch methodology: record block-numbered `QuoterV2` static-call quotes at {1k, 5k, 10k, 25k} EURe plus active-tick liquidity for both pools; archive parameters for reproducibility. TVL alone never justifies raising caps.
- Continuous monitoring: executable quote at `perSwapCap` vs oracle; alert and auto-engage keeper pause when impact at `minSwapAmount` exceeds SLIPPAGE_BPS for a sustained period (launch/pause thresholds defined in runbook).
- Rapid successive executions beyond depth **revert on `minOut`** (availability loss, keeper gas waste — not fund loss); pacing is keeper policy, best-effort, and documented as such.

## 8. Keys and recovery

### 8.1 Owners

Safe owners: `[SafeWebAuthnSigner(passkey), recoveryOwner]`, threshold 1. Either owner has full unilateral control — both are user-controlled; this is disclosed. Vortex holds no owner key.

### 8.2 RP-ID dependence (F11)

The passkey works only via an origin under Vortex's RP ID. Mitigations: (a) the mandatory recovery owner is RP-independent (EOA/hardware/second passkey); (b) the disaster-recovery package includes a static, self-hostable page for the RP domain, and Vortex commits to a domain-continuity plan (registrar lock, escrowed transfer instructions) — documented limitation, not fully eliminable; (c) credentials required discoverable + backup-eligible.

### 8.3 Removed from v1 (F05)

The automatic EIP-1271 redeem validator ("redeem to pinned refund IBAN without user signature") is removed: it was wrong-layered (EIP-1271 lives in the fallback handler, not a module), required a bespoke signature-encoding protocol, risked weakening link-message validation, and gave Vortex unilateral disposal authority that changes the custody analysis. Stranded-EURe recovery in v1 = owner-signed redeem or withdrawal. Residual: loss of both owners + paused route strands EURe (disclosed; accepted).

## 9. Fees (F10)

- Structure finalized now: per-account `feeBps` set at `initialize`, **immutable thereafter**; global immutable `MAX_FEE_BPS` (proposal: 100) and immutable `FEE_RECIPIENT` in the singleton. Fee assessed per execution on gross swap output; batching therefore charges each batched deposit pro-rata by construction (§11.4).
- **Pilot: `feeBps = 0`** (loss-leader; Vortex pays deployment + keeper gas). GA fee value is a business decision (OQ1) — changing it means new accounts get a different `feeBps`; existing accounts keep theirs.
- I1 (S2 guarantee) enumerates the treasury as a permitted recipient bounded by `feeBps ≤ MAX_FEE_BPS`. Disclosure separates fee (deterministic) from slippage bound (worst-case market execution).

## 10. Product behavior: minimums, dust, destinations (F16)

### 10.1 Minimum deposit & SLA

User-facing: deposits ≥ €25 convert within a stated SLA (proposal: 1 business hour under normal conditions; next FX market open under the weekend policy). Deposits < €25 **accumulate** until the threshold is crossed; always recoverable via owner-signed exit. `minSwapAmount` is gas-responsive within its immutable floor.

### 10.2 Gas griefing

Many small SEPA transfers can force keeper gas. Bounded by: min threshold + natural batching (balance sweep), sender is a KYC'd bank customer (low realistic abuse), and per-account keeper budget alerts. Vortex cannot prevent inbound SEPA to an issued IBAN; accepted operational cost.

### 10.3 Batching

Deposits arriving before conversion batch naturally (module sweeps balance). Allocation rule in §11.4; batching latency covered by the SLA disclosure.

### 10.4 Destination validation

At onboarding: EIP-55 checksum; deny zero/dead addresses, precompiles, the Safe itself, the module, the router, known token contracts; warn for contract destinations (recoverability unprovable) and exchange deposit addresses (rotation, minimum-deposit thresholds — user attests awareness); sanctions/blacklist screen at onboarding and **periodic re-screening** with conversion pause + user notification on a hit (F15, F16). Blacklisted destination at execution time ⇒ atomic revert, funds stay EURe (§7.1.7).

## 11. Backend (F08, F13)

### 11.1 Data model — replaces the one-shot ramp machine for this product

The existing `PhaseProcessor` is **not** reused: its documented non-atomic multi-instance lock (spec finding F-003) and retry-exhaustion gap (F-004) are unacceptable for a permanent, repeatedly funded account.

```text
MoneriumAccount: profileId, iban, safeAddress, configVersion, status (onboarding|active|suspended|closed), complianceState
FiatDeposit:     moneriumOrderId (unique), amount, currency, paymentStatus, mintTx {chainId, txHash, logIndex, blockHash}, complianceStatus
ConversionExecution: safeAddress, includedDepositIds[], eureIn, usdcGross, fee, usdcNet, destination, txHash, status, error
```

Idempotency keys: `moneriumOrderId` (accounting identity) and `(chainId, txHash, logIndex)` (on-chain identity). **On-chain balance is the execution-safety source; Monerium order IDs are the accounting source.**

### 11.2 Webhooks

HMAC verification over raw request bytes, constant-time compare, timestamp/replay window, persisted webhook-ID dedup, immediate `200` + async processing, out-of-order tolerance (state machine on `FiatDeposit.paymentStatus` accepts only forward transitions).

### 11.3 Chain handling

Confirmation policy: detect mints at 1 confirmation; execution reads live balance (safety source) so reorged mints self-correct; user **notifications** only after the execution tx reaches N confirmations (proposal: 32 blocks) with block-hash re-verification; a reorg after notification triggers a correction notice. Keeper: unique nonce manager, stale private-relay tx replacement policy.

### 11.4 Concurrency & attribution

Per-Safe serialization via Postgres advisory lock (`pg_advisory_xact_lock(hash(safeAddress))`) — contract reentrancy guards do not serialize separate keeper processes (F13). Batched output allocation: pro-rata by deposit amount, floor to 6 dp, remainder to the largest deposit — deterministic and auditable; fees allocated identically.

### 11.5 Partner/API surface (F08 Q)

The public API exposes `MoneriumAccount` (long-lived) and per-deposit `FiatDeposit`/`ConversionExecution` objects with webhooks per deposit — **not** one eternal ramp object.

## 12. Incidents and migration (F14)

- **Pause:** guardian pauses globally or per-account **instantly** (protective-only action). Unpause instant (config is user/immutable-controlled, so unpause cannot enact a hostile change).
- **02:00-UTC module vulnerability runbook:** pause all → ask Monerium to suspend affected IBANs (capability to be confirmed in MSA — G1) → notify users to stop sending EUR (email/app + status page) → assess → ship migration.
- **Migration:** deploy new module singleton (new audit) → each user authorizes `enableModule(new)` + `disableModule(old)` via an owner signature (relayed by Vortex; also possible via the DR package). The Safe address — and therefore the IBAN link — **does not change**, avoiding F01's re-association path. Users who never migrate keep the paused old module; funds remain owner-recoverable.
- Module/config version discovery: on-chain events + manifest log. Old-version support/sunset policy published.
- Users who lost all owners: automation (if unpaused) still forwards; otherwise funds sit; no backdoor exists by design — disclosed.

## 13. Launch gates (external dependencies)

- **G0 — Technical spike:** Monerium sandbox E2E (deploy → EIP-1271 link → mint → swap on fork); pin Safe/WebAuthn contracts + gas benchmark (EIP-7951 path); confirm router version & deadline semantics; confirm Chainlink EUR/USD feed address, decimals, heartbeat, and **weekend update behavior**; reproducible liquidity baseline (§7.4).
- **G1 — Monerium MSA (blocking for the S1 claim, F01):** written + sandbox-verified answers on: authorization required for `PATCH /ibans` and `POST /addresses` on whitelabel profiles; whether an IBAN/profile can be locked to a single non-movable address absent end-user authorization; credential scoping; association-change event feed; per-IBAN suspension capability; SEPA recall/fraud loss allocation **after** conversion+forwarding; behavior of conversions during profile review/suspension. If pinning is unavailable: launch is still possible with the S1 trust statement as written (Vortex trusted pre-mint) + monitoring — a product/legal decision to make explicitly.
- **G2 — Legal/compliance sign-off (F15):** custody analysis covering module authority **and** Monerium control-plane authority; MiCA scoping; DPA/controller-processor roles with Monerium; retention/access table and data-flow diagram; sanctions screening procedure; disclosure texts.
- **G3 — Audit:** contracts (module + setup lib) with invariant/fuzz suites covering §7.1 post-conditions, init front-running, pause semantics, oracle edge cases, V1-token poisoning; DR package tested on fork.
- **G4 — Pilot:** invite-only, personal profiles, `feeBps = 0`, `perSwapCap` conservative (≈ €5–10k), €1k/user/day operational limit, full monitoring live.

## 14. Open questions (reduced)

- **OQ1** — GA fee value (structure is finalized; §9).
- **OQ2** — `LIVENESS_FALLBACK_DELAY`, SLA numbers, cap/threshold launch values (G0 data).
- **OQ3** — Weekend policy final form (depends on G0 feed behavior).
- **OQ4** — G1 outcome: does the S1 statement get upgraded (Monerium pinning) or stay trust-based?
- **OQ5** — Recovery-owner UX default (second passkey vs printable key as the recommended path).

---

## Appendix A — Response to architecture review findings

| ID | Disposition | Response / change |
|---|---|---|
| F01 | **Accept** (independently verified) | `PATCH /ibans` bearer-auth redirect confirmed against live docs; memo-routing sub-claim not found in current docs (noted, immaterial). Trust model rewritten (S1); Monerium controls made launch gate G1; association monitoring + credential isolation added. Absolute non-custody claim retracted |
| F02 | **Accept** | §8.3 replaced by per-stage guarantee matrix (§4); versioned config manifest + independent verifier + continuous re-verification (§6.4) |
| F03 | **Modify** | Finding accepted: link signature binds nothing beyond address ownership; "implicitly ratifies" retracted. Resolution = review's Option 3 (trusted provisioning, stated plainly) + manifest verification. Review's Option 1 (extra EIP-712 passkey signature) **rejected as a trust upgrade**: WebAuthn lacks what-you-see-is-what-you-sign, so under a compromised frontend it yields an audit artifact, not consent — equivalent to Option 3 in the threat model it targets. Destination attestation is legal consent (§6.3). "One signature" demoted to UX description (§5.1.7) |
| F04 | **Accept** | Option B selected: immutable singleton + Safe-keyed config, `initialize` once with `msg.sender == safe` (atomic via setup library; keyed-by-caller ⇒ not front-runnable), `setDestination` Safe-only, `feeBps` immutable post-init, versioned events (§6.2). Safe v1.4.1 pinned by address + runtime hash; custom factory dropped for canonical factory + minimal setup lib |
| F05 | **Accept** | Correct on all points (module ≠ fallback handler; hash-only 1271 input; IBAN canonicalization; replay; link-message weakening; unilateral-disposal custody impact). Auto-redeem validator removed from v1 (§8.3); recovery = mandatory independent owner + owner-signed redeems. Fallback handler = canonical CompatibilityFallbackHandler only |
| F06 | **Accept resolution; correct one argument** | v1: module constructs all calldata; pinned router/path/recipient; no keeper calldata; no registry; guarantee scoped to EURe/USDC in the dedicated Safe; instant pause vs deployment-grade additions (§7.1–7.2). Correction: balance-delta post-conditions already defeat recipient/path redirection of swap output atomically — the genuine residual was other assets/approvals and nested calls, which the scoping + internal-calldata resolution addresses |
| F07 | **Accept** | CoW removed from same-interface claim; deferred to a standalone v2 spec with its own lifecycle/threat model (order authorization, watchtower, settlement-time 1271, partial fills, fallback-handler coexistence) |
| F08 | **Accept** (verified in-repo) | Spec findings F-003/F-004 confirmed in `docs/security-spec/03-ramp-engine/state-machine.md`. New persistent model (§11.1), idempotency keys, advisory-lock serialization, per-deposit API objects (§11.5). New security-spec file required per repo sync rule; legacy `05-integrations/monerium.md` superseded-by link |
| F09 | **Accept** | Raw-unit pseudocode with `10^(12+ORACLE_DECIMALS)` scaling (=10^20 at 8 dec), read-once decimals, staleness ceiling, floor rounding, explicit A4 (USDC/USD = 1 within margin), weekend policy pending G0 feed-behavior check; loss statement rewritten as oracle-model-relative (§7.3) |
| F10 | **Accept** | Fee structurally finalized: per-account immutable `feeBps` (pilot 0), immutable `MAX_FEE_BPS` + treasury; I1/S2 updated to enumerate the fee recipient; per-execution assessment with pro-rata batch allocation (§9, §11.4) |
| F11 | **Accept** | RP-ID dependence acknowledged (§8.2). Independent recovery owner **mandatory** at onboarding (§5.1.3); DR package (Vortex-independent, fork-tested, incl. self-hostable RP page) a launch deliverable; domain-continuity plan documented; credentials discoverable + backup-eligible required |
| F12 | **Accept resolution; correct one argument** | Caps reframed as availability parameters; `minOut` is the safety condition; block-numbered reproducible quoting methodology + continuous executable-depth monitoring + pause thresholds (§7.4). Correction: rapid cap-sized executions revert on `minOut` rather than execute at bad prices — availability/gas loss, not fund loss |
| F13 | **Accept** | Full webhook (HMAC/dedup/replay), confirmation/reorg, nonce, advisory-lock, and allocation spec added (§11.2–11.4); balance = safety source, order IDs = accounting source |
| F14 | **Accept** | Instant guardian pause; incident runbook incl. Monerium IBAN suspension (G1 question); owner-authorized module migration that **keeps the Safe address** (avoids F01 re-association); version discovery; sunset policy (§12) |
| F15 | **Accept** | v1 = personal, newly onboarded only; G2 gate for legal/DPA/retention/sanctions; SEPA-recall loss allocation moved into G1 MSA questions; destination re-screening added (§10.4) |
| F16 | **Accept** | Min deposit + accumulation + SLA disclosure (§10.1); gas-griefing bounded and accepted (§10.2); destination validation/denylist/warnings/re-screening (§10.4). Noted: griefing realism is low (KYC'd bank senders) but policy specified regardless |
| F17 | **Accept** | All six corrections applied: atomic revert on blacklisted destination (funds remain EURe); "Vortex executes only the constrained policy"; withhold/censor language scoped; extraction bound restated as oracle-model-relative incl. fee; passkey-sync nuance; EIP-7951 treated as live with G0 benchmarking of the pinned implementation |
| F18 | **Accept** | v1 composition cut to: canonical Safe + passkey signer + recovery owner + one module (internal calldata) + canonical fallback handler. Removed: 4337, custom factory, generic registry, aggregator calldata, CoW, auto-redeem validator, mutable fees. Matches review §6 with one divergence: module topology is Option B (singleton+config) rather than per-Safe clones — one audited deployment, no per-user bytecode, equivalent immutability of logic |

**Requested end-to-end statement (review §8):** the composition now supports this security statement — *"Once EURe is minted to the user's Safe, Vortex's total authority is: execute the fixed EURe→USDC→destination conversion within an oracle-checked slippage bound and a disclosed fee; pause it; and tune bounded availability parameters. Redirecting or extracting minted principal beyond the slippage margin + fee requires breaking a stated assumption (oracle integrity, token-contract behavior, audited-code correctness) — not merely abusing any authority Vortex holds. Before mint, Vortex and Monerium hold monitored, contractually constrained, but real authority over deposit routing; users are told so."*
