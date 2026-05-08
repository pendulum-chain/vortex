# Spec Delta — May 2026 (BRL on Base + Speedy BRL Flow)

**Branch context:** `speedy-brl-flow` was merged into `create-spec-and-security-audit`. This delta documents:

1. The architectural simplification of BRL on/off-ramp flows (Pendulum/Moonbeam/XCM removed → Base + EVM-Nabla + Squid).
2. New mechanisms touching multiple modules (no-permit fallback, deposit-QR gating, presigned-tx partitioning, EVM fee distribution, EVM subsidization).
3. Open audit findings introduced or surfaced by these changes — to be addressed in the next audit pass.

> Existing finding IDs (F-001 through F-067) are preserved. New findings introduced in this delta are numbered **F-NEW-01** through **F-NEW-07**.

---

## 1. Architectural Changes

### 1.1 BRL on-ramp (Avenia → Base → user destination)

**Old flow:** PIX → BRLA mint on Moonbeam → XCM → Pendulum → Nabla swap → XCM out → destination chain.

**New flow:** PIX → Avenia mints BRLA on **Base** ephemeral → Nabla-on-EVM swap (BRLA → USDC) on Base → optional Squid bridge to user's destination EVM chain → `destinationTransfer`.

Trivial passthrough: if destination is **Base + USDC**, Squid is skipped entirely (commit `4b0017adb`).

Code references:
- Route builder: `apps/api/src/api/services/transactions/onramp/routes/avenia-to-evm-base.ts`
- Mint handler: `apps/api/src/api/services/phases/handlers/brla-onramp-mint-handler.ts`
- Onramp Nabla wrapper: `addNablaSwapTransactionsOnBase` → `createNablaTransactionsForOnrampOnEVM` (`@vortexfi/shared`)

### 1.2 BRL off-ramp (user EVM → Base → Avenia PIX)

**Old flow:** User's crypto → Pendulum (Nabla swap) → Moonbeam (XCM) → BRLA payout via `brla-payout-moonbeam-handler`.

**New flow:** User EVM (any supported) → Squid bridge to **Base USDC** → `distributeFeesEvm` (USDC fees first) → Nabla-on-EVM swap (USDC → BRLA) on Base → `brla-payout-base-handler` triggers Avenia PIX payout.

Code references:
- Route builder: `apps/api/src/api/services/transactions/offramp/routes/evm-to-brl-base.ts`
- Payout handler: `apps/api/src/api/services/phases/handlers/brla-payout-base-handler.ts`

**Removed:** `apps/api/src/api/services/phases/handlers/brla-payout-moonbeam-handler.ts` (no longer registered; phase `brlaPayoutOnMoonbeam` deleted).

### 1.3 Phase additions

| New Phase | Handler | Purpose |
|---|---|---|
| `brlaPayoutOnBase` | `brla-payout-base-handler.ts` | BRLA→Avenia transfer + PIX payout trigger |
| `nablaApproveEvm` | (existing handler, EVM variant) | Approve Nabla router on Base |
| `nablaSwapEvm` | (existing handler, EVM variant) | Execute swap on Nabla-on-Base |
| `subsidizePreSwapEvm` | `subsidize-pre-swap-evm-handler.ts` | Top up Base ephemeral input balance |
| `subsidizePostSwapEvm` | `subsidize-post-swap-evm-handler.ts` | Top up Base ephemeral output balance |
| `distributeFeesEvm` | `distribute-fees-handler.ts` (multiplexed) | Multicall3 batch ERC-20 fee distribution on Base |
| `squidRouterNoPermitTransfer` | (handled in `squidrouter-permit-execution-handler.ts` no-permit branch) | User-wallet ERC-20 direct transfer (no permit available) |
| `squidRouterNoPermitApprove` | (same handler) | User-wallet approve to Squid spender |
| `squidRouterNoPermitSwap` | (same handler) | User-wallet Squid swap call |

### 1.4 Phase ordering changes

- **BRL offramp on Base**: `distributeFeesEvm` runs **before** `nablaSwapEvm` (commit `423a38c79`) so partner/vortex fees are taken in USDC before swapping to BRLA.

### 1.5 Cross-cutting infrastructure changes

| Area | Change | Commit |
|---|---|---|
| Presigned-tx exposure | `partitionUnsignedTxs` + `filterUnsignedTxsForResponse` hide ephemeral txs from SDK until `ephemeralPresignChecksPass=true` | `4838e3c69` |
| Deposit-QR release | BRL on-ramp QR code only released to client after presign checks pass | `32be1659c` |
| No-permit fallback | New `isNoPermitFallback` path with user-submitted approve+swap (or direct transfer); backend verifies via `waitForTransactionReceipt` | `b45768be3` |
| Squid arrival timeout | `waitUntilTrue` enforces a finite timeout | `f7905dc40` |
| Squid 429 backoff | Exponential retry on rate-limit responses | `ff0b82feb` |
| EVM fee distribution | New Multicall3 path; `Partner.payout_address_evm` column added (migration 026); old `payout_address` renamed to `payout_address_substrate` (migration 027) | `544f70aee`, `f3dbb7ea7` |
| EVM fee balance precondition | 60-second poll (`FEE_BALANCE_POLL_TIMEOUT_MS`) before `distributeFeesEvm` | `b518fcec8` |
| Skip-Squid trivial case | Quote engine + route builder short-circuit for Base+USDC destination | `4b0017adb` |
| Mint optimization | Skip `brlaOnrampMint` polling if balance already present (recovery scenario) | `6ea53d9d0` |

---

## 2. Spec Files Updated

| File | Change Type | Summary |
|---|---|---|
| `00-system-overview/architecture.md` | Patch | Added Base to chain list; updated BRL provider name to "BRLA/Avenia" |
| `03-ramp-engine/ramp-phase-flows.md` | Major rewrite (BRL section) | Replaced Moonbeam/Pendulum BRL corridors with Base flows; updated handler categories table; added new audit checklist items |
| `03-ramp-engine/ephemeral-accounts.md` | Patch | Added Base ephemeral; reframed F-045 as accepted-risk policy decision (no EVM cleanup) |
| `03-ramp-engine/fee-integrity.md` | Patch | Added EVM Multicall3 distribution mechanism; documented `Partner.payout_address_evm`/`payout_address_substrate`; documented BRL ordering invariants |
| `03-ramp-engine/transaction-validation.md` | Patch | Documented partitioning + filtering + deposit-QR gating; documented no-permit fallback phase skip |
| `05-integrations/brla.md` | **Full rewrite** | Replaced Moonbeam/PIX/XCM content with Base + Avenia API flow; added three-amount model; new audit checklist |
| `05-integrations/squid-router.md` | **Full rewrite** | Added Base as supported chain; documented skip-Squid path, no-permit fallback, arrival timeout, 429 retry; updated audit checklist |
| `06-cross-chain/fund-routing.md` | Patch | Added EVM subsidization handlers; documented `MOONBEAM_FUNDING_PRIVATE_KEY` cross-EVM reuse and proposed rename |

---

## 3. Open Findings Introduced (or Surfaced) by This Delta

These are findings **the user has confirmed direction on** during the spec rewrite session. Severity is the spec author's estimate; user confirmation noted per finding.

### F-NEW-01 — Hardcoded BRL offramp validation amount (HIGH, confirmed bug)

**Location:** `apps/api/src/api/services/transactions/offramp/validation.ts` → `validateBRLOfframp`.

**Issue:** Hardcoded `offrampAmountBeforeAnchorFeesRaw: "200"` with a TODO comment, never validated against `quote.outputAmount`.

**Risk:** Any BRL offramp could pass validation regardless of the actual offramp amount, bypassing a critical anchor-fee precondition check.

**User decision:** **Bug — must validate against quote.**

**Suggested fix:** Replace the hardcoded value with the real pre-anchor-fee amount derived from `quote.metadata.nablaSwapEvm.outputAmountRaw` (or equivalent), and assert equality with the actual presigned BRLA transfer amount.

---

### F-NEW-02 — EVM subsidy handlers lack USD cap (MEDIUM, confirmed bug)

**Location:** `apps/api/src/api/services/phases/handlers/subsidize-pre-swap-evm-handler.ts` and `subsidize-post-swap-evm-handler.ts`.

**Issue:** Unlike `final-settlement-subsidy.ts` (which enforces `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` after the F-001 fix), the new EVM subsidize-pre/post handlers have **no USD cap**. They trust `quote.metadata.nablaSwapEvm.inputAmountForSwapRaw` / `outputAmountRaw` directly.

**Risk:** If quote metadata is ever manipulable (DB compromise, race in quote engine, partner-controlled input fed without sanitization), the funding key on Base can be drained on a single ramp. Same risk class as original F-001.

**User decision:** **Bug — EVM needs equivalent USD cap.**

**Suggested fix:** Port the `validateSubsidyAmount` + USD cap logic from `final-settlement-subsidy.ts` into the EVM subsidy handlers. Use a Base-native USD reference (USDC at 1.0 or chainlink feed). Throw `UnrecoverableError` (with the `throw` keyword) when cap is exceeded.

---

### F-NEW-03 — `backupApprove` uses `maxUint256` allowance (LOW, design-debt)

**Location:** `apps/api/src/api/services/transactions/onramp/routes/avenia-to-evm-base.ts:213-232`.

**Issue:** The destination-chain backup approve presigned transaction grants `maxUint256` allowance to the funding-account-derived spender (same risk class as F-055).

**Risk:** If the funding key (`MOONBEAM_FUNDING_PRIVATE_KEY`) is compromised, the attacker has unlimited ERC-20 allowance from each user's destination ephemeral for the bridged token. This is the existing F-055 pattern duplicated for the new BRL onramp path.

**User decision:** Implicit (existing F-055 pattern). Confirm reduction to a precise needed amount.

**Suggested fix:** Calculate the exact maximum amount the backup may need (e.g., `inputAmountRawFinalBridge`) and approve only that amount.

---

### F-NEW-04 — No-permit fallback receipt validation is shallow (MEDIUM, needs hardening)

**Location:** `apps/api/src/api/services/phases/handlers/squidrouter-permit-execution-handler.ts` → `waitForUserHash`.

**Issue:** `waitForUserHash` only verifies `receipt.status === "success"`. It does NOT verify:
- `receipt.from === expected user address`
- `receipt.to === expected Squid router contract`
- Decoded calldata matches the expected approve/swap parameters (token, spender, amount)
- Transferred token / value matches the ramp

**Risk (current):** A user (or attacker controlling the user's signing flow) could report any successful tx hash from their wallet. The subsequent `squidRouterPay` balance-check on Base provides a backstop — if no funds actually arrive, the ramp times out. So the worst plausible outcome is a stuck ramp (DoS), not a fund-routing exploit.

**Risk (theoretical):** A clever sequence of unrelated successful txs reported as approve+swap could let the ramp advance into states it shouldn't be in. Combined with weaknesses in subsidization caps (F-NEW-02), this could compound.

**User decision:** **Investigate.** This spec entry surfaces the gap; a code-side hardening task is appropriate.

**Suggested fix:** In `waitForUserHash`, decode `receipt` and assert:
- `receipt.from === state.userAddress` (or equivalent)
- For `squidRouterNoPermitApprove`: `receipt.to === inputTokenAddress`, calldata is `approve(squidSpender, amount)`, amount matches expected
- For `squidRouterNoPermitSwap`: `receipt.to === SQUID_ROUTER_ADDRESS`, calldata matches expected swap params
- For `squidRouterNoPermitTransfer`: `receipt.to === inputTokenAddress`, calldata is `transfer(baseEphemeral, amount)`, amount matches the ramp's input amount

---

### F-NEW-05 — No EVM ephemeral cleanup (ACCEPTED RISK)

**Location:** `apps/api/src/api/services/phases/post-process/` — no `BasePostProcessHandler`, `PolygonPostProcessHandler`, etc.

**Issue:** EVM ephemerals (Base, Polygon, etc.) accumulate residual ETH (gas) and any leftover tokens after each ramp. Unlike Stellar/Pendulum/Moonbeam, no cleanup transactions are issued.

**User decision:** **Accepted risk.** Team explicitly decided to skip cleanup transactions on EVM networks until a proper custody setup is in place. F-045 reframed as policy choice.

**Action:** No code change required. Tracked here for visibility. Revisit when custody solution is designed.

---

### F-NEW-06 — `Partner.payout_address_evm` NULL handling unverified (MEDIUM)

**Location:** Migration 026 (`apps/api/src/database/migrations/026-add-payout-address-evm-to-partners.ts`); `apps/api/src/api/services/transactions/common/feeDistribution.ts`.

**Issue:** Migration 026 adds `payout_address_evm` as nullable with **no backfill**. For partners created before 026 (or any partner with NULL `payout_address_evm`), the column is empty when `distributeFeesEvm` runs.

**Per team intent:** Should fall back to a default Vortex address to prevent fund loss.

**Current state:** Unverified. Code path for NULL needs to be traced — if the current code throws or sends to `0x0`, fees may be lost or the phase fails for all pre-026 partners.

**User decision:** **Falls back to default Vortex address (intended).**

**Suggested fix (if not already implemented):**
1. Define a `DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS` config constant.
2. In `feeDistribution.ts`, when reading `partner.payout_address_evm`, coalesce NULL to the default.
3. Add a unit test for partner with NULL `payout_address_evm`.
4. Optional: emit a warning log when the fallback is used so reconciliation can identify partners missing config.

---

### F-NEW-07 — `MOONBEAM_FUNDING_PRIVATE_KEY` is misnamed (LOW, refactor)

**Location:** `apps/api/src/config/index.ts` (constant); `subsidize-*-evm-handler.ts`, `avenia-to-evm-base.ts:214`.

**Issue:** The same private key now funds operations on **Moonbeam, Base, and any other EVM chain**. The "MOONBEAM_" prefix is misleading and creates a cognitive trap.

**User decision:** **Rename to `EVM_FUNDING_PRIVATE_KEY` and refactor from a top-level constant to a getter (e.g., `getEvmFundingAccount(network)`)** so the cross-EVM reuse is explicit.

**Suggested fix:**
1. Rename env var `MOONBEAM_FUNDING_PRIVATE_KEY` → `EVM_FUNDING_PRIVATE_KEY` (with deprecation alias).
2. Replace direct constant import with a service/getter that takes a `Networks` parameter and returns the correct viem account (currently always the same key, but the API is forward-compatible with chain-specific keys).
3. Update all callers in `subsidize-*-evm-handler.ts`, `final-settlement-subsidy.ts`, `avenia-to-evm-base.ts`, and any Squid handler that funds gas.
4. Update spec audit checklist (F-029 line) accordingly.

---

## 4. Open Items NOT Resolved in This Pass

These are findings that surfaced during the rewrite but were not investigated to closure. They warrant follow-up.

### F-NEW-08 — Skip-Squid path: validation parity with full path (LOW, investigate)

The skip-Squid trivial path (Base+USDC destination) emits only a `destinationTransfer` presigned tx. The destination address validation that normally runs during quote `validate()` is shared between paths, so no checks are bypassed in principle — but a code-side audit comparing the two paths phase-by-phase would be reassuring.

### F-NEW-09 — `payOutTicketId` recovery branch and `brlaPayoutTxHash` recovery branch interaction (LOW, edge case)

`brla-payout-base-handler.ts` has two independent recovery branches (existing ticket ID, existing tx hash). If a ramp recovers with both fields set, the handler short-circuits to `checkTicketStatusPaid` before re-broadcasting the on-chain tx. Confirm: is it possible to reach a state where the on-chain tx never confirmed but a ticket exists? If yes, polling-only recovery would miss the on-chain failure.

### F-NEW-10 — Avenia anchor-fee assumption in three-amount model (MEDIUM, monitoring)

The off-ramp three-amount model assumes `transferAmount ≥ payoutAmount` (i.e., Avenia anchor fee ≥ 0). If Avenia ever introduces a credit or promotional rate that violates this, `quote.outputAmount` could exceed the deposited BRLA. Add a runtime invariant check: `Big(brlaTransferAmountRaw).gte(quote.outputAmount.times(10**brlaDecimals))` before the on-chain transfer.

### F-NEW-11 — Audit existing `F-029` (`MOONBEAM_FUNDING_PRIVATE_KEY` = `MOONBEAM_EXECUTOR_PRIVATE_KEY`) under new BRL flow

Under the old flow, this key collision was scoped to Moonbeam. Now it applies to Base too. Re-rate severity in light of the larger blast radius (compromise affects BRL flows + EUR flows + Squid permit execution).

---

## 5. Carried-Over Findings (No Status Change)

These pre-existing findings remain open and are unchanged by the BRL migration:

- **F-014**: Avenia/external API timeouts not configured
- **F-029**: `MOONBEAM_FUNDING_PRIVATE_KEY` and `MOONBEAM_EXECUTOR_PRIVATE_KEY` collide (now applies to Base too — see F-NEW-11)
- **F-038, F-039, F-040, F-041, F-042, F-043, F-047, F-048, F-049, F-050**: Validation gaps in presigned tx content
- **F-053**: Five phase handlers lack idempotency guards
- **F-054**: `backupSquidRouterApprove` / `backupSquidRouterSwap` / `backupApprove` have no registered phase handler
- **F-055**: `backupApprove` uses `maxUint256` (now also applies to BRL onramp — see F-NEW-03)
- **F-056**: `sandboxEnabled` bypass
- **F-057**: `destinationTransfer` does not validate `to` address against quote
- **F-058**: No per-presigned-transaction TTL
- **F-051, F-052**: Cleanup observability gaps (less relevant now that EVM cleanup is intentionally skipped — F-NEW-05)

---

## 6. Suggested Next Audit Pass

Priority order for the next audit/dev cycle, based on severity × likelihood:

1. **F-NEW-02** (HIGH if cap matters in practice) — Add EVM subsidy USD cap. Mirror F-001 fix.
2. **F-NEW-01** (HIGH) — Replace hardcoded `validateBRLOfframp` amount.
3. **F-NEW-06** (MEDIUM) — Verify and harden `payout_address_evm` NULL fallback.
4. **F-NEW-04** (MEDIUM) — Harden no-permit fallback receipt validation.
5. **F-NEW-11** (MEDIUM) — Re-evaluate F-029 severity with Base in scope.
6. **F-NEW-07** (LOW, mostly hygiene) — Rename `MOONBEAM_FUNDING_PRIVATE_KEY` → `EVM_FUNDING_PRIVATE_KEY` with proper getter abstraction.
7. **F-NEW-03** (LOW) — Tighten `backupApprove` allowance from `maxUint256` to a calculated bound.
8. **F-NEW-08, F-NEW-09, F-NEW-10** — Investigate edge cases and add invariant checks.
9. **F-NEW-05** — Defer until custody solution is designed (per team decision).
