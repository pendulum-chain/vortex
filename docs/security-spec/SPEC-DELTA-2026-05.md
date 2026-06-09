# Spec Delta — May 2026 (BRL on Base + Speedy BRL Flow)

**Branch context:** `speedy-brl-flow` was merged into `create-spec-and-security-audit`. This delta documents:

1. The architectural simplification of BRL on/off-ramp flows (Pendulum/Moonbeam/XCM removed → Base + EVM-Nabla + Squid).
2. New mechanisms touching multiple modules (no-permit fallback, deposit-QR gating, presigned-tx partitioning, EVM fee distribution, EVM subsidization).
3. Open audit findings introduced or surfaced by these changes — to be addressed in the next audit pass.

> Existing finding IDs (F-001 through F-067) are preserved. New findings introduced in this delta are numbered **F-NEW-01** through **F-NEW-11** (with **F-NEW-06** split into **06a** and **06b**).

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

**New flow:** User EVM (any supported) → Squid bridge to **Base USDC** → `distributeFees` (USDC fees first) → Nabla-on-EVM swap (USDC → BRLA) on Base → `brla-payout-base-handler` triggers Avenia PIX payout.

Code references:
- Route builder: `apps/api/src/api/services/transactions/offramp/routes/evm-to-brl-base.ts`
- Payout handler: `apps/api/src/api/services/phases/handlers/brla-payout-base-handler.ts`

**Removed:** `apps/api/src/api/services/phases/handlers/brla-payout-moonbeam-handler.ts` (no longer registered; phase `brlaPayoutOnMoonbeam` deleted).

### 1.3 Phase additions

| New Phase | Handler | Purpose |
|---|---|---|
| `brlaPayoutOnBase` | `brla-payout-base-handler.ts` | BRLA→Avenia transfer + PIX payout trigger |
| `squidRouterNoPermitTransfer` | (handled in `squidrouter-permit-execution-handler.ts` no-permit branch) | User-wallet ERC-20 direct transfer (no permit available) |
| `squidRouterNoPermitApprove` | (same handler) | User-wallet approve to Squid spender |
| `squidRouterNoPermitSwap` | (same handler) | User-wallet Squid swap call |

`nablaApprove`, `nablaSwap`, `subsidizePreSwap`, `subsidizePostSwap`, and `distributeFees` are polymorphic phases whose handlers dispatch to a Substrate (Pendulum) or EVM (Base) branch at runtime based on the ephemeral chain involved. They are not new phases; they were extended with EVM branches as part of this delta.

### 1.4 Phase ordering changes

- **BRL offramp on Base**: `distributeFees` (EVM branch) runs **before** `nablaSwap` (EVM branch) (commit `423a38c79`) so partner/vortex fees are taken in USDC before swapping to BRLA.

### 1.5 Cross-cutting infrastructure changes

| Area | Change | Commit |
|---|---|---|
| Presigned-tx exposure | `partitionUnsignedTxs` + `filterUnsignedTxsForResponse` hide ephemeral txs from SDK until `ephemeralPresignChecksPass=true` | `4838e3c69` |
| Deposit-QR release | BRL on-ramp QR code only released to client after presign checks pass | `32be1659c` |
| No-permit fallback | New `isNoPermitFallback` path with user-submitted approve+swap (or direct transfer); backend verifies via `waitForTransactionReceipt` | `b45768be3` |
| Squid arrival timeout | `waitUntilTrue` enforces a finite timeout | `f7905dc40` |
| Squid 429 backoff | Exponential retry on rate-limit responses | `ff0b82feb` |
| EVM fee distribution | New Multicall3 path; `Partner.payout_address_evm` column added (migration 026); old `payout_address` renamed to `payout_address_substrate` (migration 027) | `544f70aee`, `f3dbb7ea7` |
| EVM fee balance precondition | 60-second poll (`FEE_BALANCE_POLL_TIMEOUT_MS`) before the EVM branch of `distributeFees` | `b518fcec8` |
| Skip-Squid trivial case | Quote engine + route builder short-circuit for Base+USDC destination | `4b0017adb` |
| Mint optimization | Skip `brlaOnrampMint` polling if balance already present (recovery scenario) | `6ea53d9d0` |

---

## 2. Spec Files Updated

| File | Change Type | Summary |
|---|---|---|
| `00-system-overview/architecture.md` | Patch | Added Base to chain list; updated BRL provider name to "BRLA/Avenia" |
| `03-ramp-engine/ramp-phase-flows.md` | Major rewrite (BRL section) | Replaced Moonbeam/Pendulum BRL corridors with Base flows; updated handler categories table; added new audit checklist items |
| `03-ramp-engine/ephemeral-accounts.md` | Patch | Added Base ephemeral; F-045/F-NEW-05 resolved by `BaseChainPostProcessHandler` (sweeps BRLA + USDC on Base) |
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

**Location:** `apps/api/src/api/services/phases/handlers/subsidize-pre-swap-handler.ts` and `subsidize-post-swap-handler.ts` (EVM branches).

**Issue:** Unlike `final-settlement-subsidy.ts` (which enforces `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` after the F-001 fix), the EVM branches of the subsidize-pre/post handlers had **no USD cap**. They trusted `quote.metadata.nablaSwapEvm.inputAmountForSwapRaw` / `outputAmountRaw` directly.

**Risk:** If quote metadata is ever manipulable (DB compromise, race in quote engine, partner-controlled input fed without sanitization), the funding key on Base can be drained on a single ramp. Same risk class as original F-001.

**User decision:** **Bug — EVM needs equivalent USD cap.**

**Suggested fix:** Port the `validateSubsidyAmount` + USD cap logic from `final-settlement-subsidy.ts` into the EVM subsidy handlers. Use a Base-native USD reference (USDC at 1.0 or chainlink feed). When the cap is exceeded, throw a recoverable phase error before submitting any transfer so the ramp waits for operator action instead of requiring manual repair of an unrecoverably failed phase.

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

### F-NEW-05 — Base ephemeral cleanup (RESOLVED)

**Location:** `apps/api/src/api/services/phases/post-process/base-chain-post-process-handler.ts`; presigned approvals in `apps/api/src/api/services/transactions/base/cleanup.ts`.

**Issue (original):** Base ephemerals could accumulate residual BRLA/USDC after BRL ramps. Other EVM ephemerals were treated similarly: no cleanup.

**Resolution:** A `BaseChainPostProcessHandler` is now registered. After `currentPhase === "complete"`, it sweeps BRLA and USDC residuals from the Base ephemeral via presigned `approve(funding, MAX_UINT256)` (ephemeral-signed) + `transferFrom(ephemeral, funding, balance)` (funding-key-signed), mirroring the Polygon pattern. ETH gas dust remains unswept by design (gas is funded just-in-time and rarely accumulates). Polygon and Hydration cleanups remain active. AssetHub cleanup remains a no-op stub.

---

### F-NEW-12 — BRL on-ramp skipped EVM pre-swap subsidization (RESOLVED)

**Location:** `apps/api/src/api/services/phases/handlers/fund-ephemeral-handler.ts:220-222`.

**Issue:** The BRL on-ramp runtime phase chain transitioned `fundEphemeral → nablaApprove` directly, skipping `subsidizePreSwap`. The handler was registered and wired downstream (`subsidizePreSwap → nablaApprove`), but no upstream handler returned `"subsidizePreSwap"` as its next phase for BRL onramps. The symmetric `subsidizePostSwap` phase was reached normally via `nablaSwap`'s nextPhase logic, producing an asymmetric flow where pre-swap subsidization was unreachable.

**Risk:** If the Avenia BRLA mint underdelivers (e.g. anchor fee not pre-deducted, transient rounding, or mint amount slightly below `inputAmountForSwapRaw`), the on-ramp would fail at `nablaSwap` with insufficient input balance instead of being topped up by the funding key (capped at 5% of `outputAmount` via `MAX_EVM_SWAP_SUBSIDY_QUOTE_FRACTION`). User funds remained on the Base ephemeral until manual recovery.

**Resolution:** Changed the BRL onramp branch of `FundEphemeralHandler.nextPhaseSelector` to return `"subsidizePreSwap"`. The phase chain is now `fundEphemeral → subsidizePreSwap → nablaApprove → nablaSwap → ...`, symmetric with the BRL off-ramp pre-swap subsidization path.

---

### F-NEW-06a — `Partner.payout_address_evm` NULL on vortex row throws (LOW, operational)

**Location:** `apps/api/src/api/services/transactions/common/feeDistribution.ts:232-241`.

**Issue:** When the active `vortex` partner row has `payout_address_evm = NULL`, the EVM branch of `distributeFees` throws `Error("Vortex partner is missing payout_address_evm...")` and the phase fails. There is no env-var fallback (e.g., `DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS`) despite team intent to fall back to a default Vortex address.

**Risk:** No fund loss (phase aborts before any transfer). Operational risk only — a misconfigured or pre-026 vortex row blocks all EVM fee distribution.

**Suggested fix:**
1. Define `DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS` env var.
2. In `feeDistribution.ts`, coalesce `vortexPartner.payoutAddressEvm ?? DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS`.
3. Log a warning when the fallback is used so reconciliation can flag the misconfigured row.

---

### F-NEW-06b — Partner `payout_address_evm` NULL silently drops markup fees (MEDIUM)

**Location:** `apps/api/src/api/services/transactions/common/feeDistribution.ts:245-253, 273`.

**Issue:** When the quote's partner has `payout_address_evm = NULL`, the code falls through silently: `partnerPayoutAddressEvm` stays `null`, `hasPartnerFees` becomes `false`, and the partner markup fee is never distributed. Vortex still gets paid; the partner does not. No error is surfaced to the partner or in logs at WARN/ERROR level.

**Risk:** Silent fee loss for the partner on every BRL-on-Base ramp where the partner row is missing EVM payout config. Partners onboarded before migration 026 (or any new partner who forgot the EVM column) lose markup with no operational signal.

**Suggested fix:**
1. At minimum: emit a WARN log when `partnerMarkupFeeUSD > 0` but `partnerPayoutAddressEvm === null`, identifying the partner ID.
2. Preferred: fail quote creation in `quote/engines/squidrouter/index.ts` (or upstream) if the requested ramp is BRL-on-Base and the partner has `payout_address_evm = NULL`.
3. Add a unit test for partner with NULL `payout_address_evm` exercising both the WARN path and the quote-time failure.

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
- **F-051, F-052**: Cleanup observability gaps — now partially relevant again since Base/Polygon/Hydration cleanups are active and benefit from per-handler success/failure metrics.

---

## 6. Suggested Next Audit Pass

Priority order for the next audit/dev cycle, based on severity × likelihood. Resolution status reflects fixes landed during the 2026-05 remediation pass. Post-review fixes on 2026-05-12 also closed the Supabase quote-ownership bypass in `assertQuoteOwnership`, restored signed-payload-aware presigned transaction matching, removed duplicate Squid permit relayer execution, restored direct-transfer permit execution, and documented the recoverable-wait policy for EVM subsidy cap breaches.

| # | Finding | Status |
|---|---|---|
| 1 | **F-NEW-02** (HIGH if cap matters in practice) — Add EVM subsidy USD cap. Mirror F-001 fix. | RESOLVED — `MAX_EVM_SWAP_SUBSIDY_QUOTE_FRACTION="0.05"` enforced in pre-swap EVM handlers and on the post-swap actual-vs-quoted swap-output discrepancy component. Post-swap discount-derived subsidy is capped separately via `MAX_EVM_POST_SWAP_DISCOUNT_SUBSIDY_QUOTE_FRACTION="0.05"`; over-cap cases are recoverable waits with no transfer submitted. |
| 2 | **F-NEW-01** (HIGH) — Replace hardcoded `validateBRLOfframp` amount. | RESOLVED — `validateBRLOfframpMetadata(quote)` reads `quote.metadata.pendulumToMoonbeamXcm.outputAmountRaw`. Dead `evm-to-brl.ts` route deleted. |
| 3 | **F-NEW-06b** (MEDIUM) — Surface or fail-fast on partner `payout_address_evm` NULL (silent markup loss). | RESOLVED — quote-time rejection (`APIError 400`) when partner has markup AND `payout_address_evm` NULL on EVM-payout routes; runtime WARN if it slips through. |
| 4 | **F-NEW-04** (MEDIUM) — Harden no-permit fallback receipt validation. | RESOLVED — `waitForUserHash` now verifies receipt `to` and tx `input` against the presigned `EvmTransactionData`. |
| 5 | **F-NEW-11** (MEDIUM) — Re-evaluate F-029 severity with Base in scope. | RESOLVED — `fund-routing.md` and `secret-management.md` updated to reflect Base blast radius (BRLA payouts, EVM fee distribution, ephemeral subsidization across all EVM chains). |
| 6 | **F-NEW-06a** (LOW) — Add `DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS` env-var fallback. | RESOLVED — `config.defaults.vortexEvmPayoutAddress` falls back when `vortexPartner.payoutAddressEvm` is NULL. |
| 7 | **F-NEW-07** (LOW, mostly hygiene) — Rename `MOONBEAM_FUNDING_PRIVATE_KEY` → `EVM_FUNDING_PRIVATE_KEY` with proper getter abstraction. | RESOLVED — new `EVM_FUNDING_PRIVATE_KEY` env (back-compat fallback to `MOONBEAM_EXECUTOR_PRIVATE_KEY`); all 13 call sites migrated to `getEvmFundingAccount(network)` helper at `apps/api/src/api/services/phases/evm-funding.ts`. |
| 8 | **F-NEW-03** (LOW) — Tighten `backupApprove` allowance from `maxUint256` to a calculated bound. | RESOLVED — `avenia-to-evm-base.ts` `backupApprove` now uses `inputAmountRawFinalBridge × 1.05`. |
| 9 | **F-NEW-08** — Investigate skip-Squid passthrough divergence. | NO BUG — same-chain same-token passthrough has no Squid fee; `networkFeeUSD="0"` and 1:1 rate are correct. |
| 10 | **F-NEW-09** — Investigate BRLA payout recovery branches. | NO BUG — once `payOutTicketId` exists, BRLA acknowledged the EVM payout; on-chain receipt is no longer authoritative. |
| 11 | **F-NEW-10** — Avenia anchor-fee assumption in three-amount model. | NO BUG — `OffRampMergeSubsidyEvmEngine` adds the projected subsidy into `nablaSwapEvm.outputAmountRaw`, and `OffRampFinalizeEngine` then sets `quote.outputAmount = nablaSwapEvm.outputAmountDecimal − anchorFee`. The relationship `nablaSwapEvm.outputAmountRaw ≥ quote.outputAmount × 10^brlaDecimals` is therefore tautological at quote-build time. The actual safety net is the EVM branch of `subsidize-post-swap-handler.ts`, which tops the ephemeral up to `nablaSwapEvm.outputAmountRaw` at runtime using split caps for swap discrepancy and discount subsidy. No build-time assertion needed. |
| 12 | **F-NEW-05** — Add Base ephemeral cleanup. | RESOLVED — `BaseChainPostProcessHandler` sweeps BRLA and USDC residuals after `currentPhase === "complete"` via presigned `approve` + funding-key `transferFrom`. Wired into both `evm-to-brl-base.ts` (offramp) and `avenia-to-evm-base.ts` (onramp). New phase keys `baseCleanupBrla` and `baseCleanupUsdc`. ETH gas dust on EVM ephemerals remains unswept (intentional). |
| 13 | **F-013** — Multiple security-sensitive endpoints have no authentication. | RESOLVED — dual-track auth wired across all `/v1/ramp/*` and `/v1/ramp/quotes(/best)` endpoints. Each request carrying credentials must present **either** `X-API-Key: sk_*` (partner SDK) **or** `Authorization: Bearer <jwt>` (Supabase frontend); invalid credentials are always rejected. Per-principal ownership guards (`assertRampOwnership`, `assertQuoteOwnership`) prevent cross-tenant access: partners are scoped via `RampState.quoteId → QuoteTicket.partnerId`, Supabase users via `RampState.userId`. Anonymous access is permitted only on register/update/start/status/errors and only when the underlying resource is fully anonymous (no partner, no user owner); `getRampHistory` always requires credentials. `enforcePartnerAuth()` is active on `/quotes` and `/quotes/best`, closing the partner-spoofing vector. |

---

## 6. Auth Posture (Post-Delta)

The dual-track auth model — partner SDK key OR Supabase user session — is the canonical model going forward. Anonymous access is permitted **only** on register/update/start/status/errors endpoints, and **only** when the underlying quote/ramp is itself fully anonymous (no `partnerId` and no `userId`). Owned resources always require matching credentials.

| Endpoint | Auth | Owner check |
|---|---|---|
| `POST /v1/ramp/quotes` | `apiKeyAuth({required: false})` + `enforcePartnerAuth()` | Partner key, if present, must match `partnerId` in body |
| `POST /v1/ramp/quotes/best` | `apiKeyAuth({required: false})` + `enforcePartnerAuth()` | Same as above |
| `POST /v1/ramp/register` | `optionalPartnerOrUserAuth()` | `assertQuoteOwnership(req, quoteId)` — anonymous caller allowed iff quote has `partnerId === null AND userId === null` |
| `POST /v1/ramp/update` | `optionalPartnerOrUserAuth()` | `assertRampOwnership(req, rampId)` — anonymous caller allowed iff ramp has `userId === null` AND its quote has `partnerId === null` |
| `POST /v1/ramp/start` | `optionalPartnerOrUserAuth()` | `assertRampOwnership(req, rampId)` — same condition as update |
| `GET /v1/ramp/:id` | `optionalPartnerOrUserAuth()` | `assertRampOwnership(req, id)` — same condition as update |
| `GET /v1/ramp/:id/errors` | `optionalPartnerOrUserAuth()` | `assertRampOwnership(req, id)` — same condition as update |
| `GET /v1/ramp/history/:walletAddress` | `requirePartnerOrUserAuth()` | Service-layer filter: partner → owned `quoteId`s; user → matching `userId`. **Never anonymous.** |
| `/v1/brla/*` user data | `requireAuth` | Supabase userId scoping |
| `/v1/maintenance/*` | `adminAuth` | n/a |
| `/v1/webhook/*` | `apiKeyAuth` | Partner ownership |

`optionalPartnerOrUserAuth()` accepts a request with no credentials, but a request that *presents* invalid credentials (malformed `X-API-Key` or expired/forged Bearer) is still rejected with 401. The downstream ownership checks then decide whether the resource is reachable: anonymous callers are admitted only for fully-anonymous quotes/ramps. This preserves the principle that owned resources are never reachable without matching credentials, while allowing API clients without keys (or first-time users without a Supabase session) to drive a ramp end-to-end.

Frontend uses `Authorization: Bearer` (Supabase). SDK partners use `X-API-Key: sk_*`. SDK clients without keys may operate against fully-anonymous quotes (no partner-rate benefits). Both authenticated principals grant equal access subject to per-principal ownership scoping.
