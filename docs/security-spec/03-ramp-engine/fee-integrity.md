# Fee Integrity

## What This Does

Fee calculation determines how much the user pays for a ramp operation and how that payment is distributed. This is a **critical financial security concern** because incorrect fee handling directly impacts user funds and platform revenue.

### ⚠️ KNOWN ISSUE: Dual Fee System Discrepancy

**Two parallel fee calculation systems exist, and they do NOT agree:**

1. **Token-config-based fees (ACTUALLY USED)** — Defined in `shared/src/tokens/*/config.ts`. Parameters: `onrampFeesBasisPoints`, `onrampFeesFixedComponent`, `offrampFeesBasisPoints`, `offrampFeesFixedComponent`. Applied via `calculateTotalReceiveOnramp()` and `calculateTotalReceive()` helper functions. **These are the fees that actually reduce the user's output amount.**

2. **Database-based fees (STORED/DISPLAYED ONLY)** — Calculated by `calculateFeeComponents()` using the `FeeConfiguration` and `Partner` database tables. Components: network fee, vortex fee, anchor fee, partner markup fee. These are stored in the database and returned in the API response, but **they do NOT determine the actual fee deduction**.

This means the fees shown to the user (from the database system) may differ from the fees actually applied (from the token config system). This is documented in `docs/architecture/current-fee-derivation.md` as a partially-implemented refactor.

### Fee Application Points

- **On-ramp:** Fees are deducted from the input amount BEFORE the swap. `inputAmountAfterFees = inputAmount - fees`.
- **Off-ramp:** Fees are deducted from the swap output AFTER the swap. `outputAfterFees = swapOutput - fees`.
- **Anchor fees** (Avenia/BRLA, Stellar) are deducted by the external anchor during the anchor interaction phase — the system must account for this deduction.
- **Platform fees** (vortex, network, partner markup) are distributed during the `distributeFees` phase, which dispatches to a Substrate (Pendulum) or EVM (Base, Multicall3) implementation based on the ephemeral chain in use.

### Distribution Mechanisms

Two parallel implementations live in `apps/api/src/api/services/transactions/common/feeDistribution.ts`:

1. **Substrate (Pendulum)** — Single batch extrinsic that transfers each fee component to the corresponding partner address read from `Partner.payout_address_substrate`.
2. **EVM (Base)** — `Multicall3.aggregate3` batch (`MULTICALL3_ADDRESS = 0xcA11bde05977b3631167028862bE2a173976CA11`) executes one ERC-20 transfer per fee recipient atomically. Recipient addresses come from `Partner.payout_address_evm`. The handler pre-checks the active `vortex` partner row has a non-NULL `payout_address_evm` and aborts the phase otherwise; partner-markup recipients fall through silently when the quote partner's `payout_address_evm` is NULL.

The `distribute-fees-handler.ts` chooses the correct path at runtime based on the ephemeral network (Pendulum vs. Base). For EVM, the handler pre-checks that the ephemeral has sufficient ERC-20 balance via `checkEvmBalanceForToken` with a 60-second poll timeout (`FEE_BALANCE_POLL_TIMEOUT_MS`).

### Ordering with Nabla swap (BRL flows on Base)

- **Offramp (USDC → BRLA)**: `distributeFees` runs **before** `nablaSwap` so partner/vortex fees are taken in USDC (the universal stablecoin) before swapping the remainder to BRLA.
- **Onramp (BRLA → USDC)**: `distributeFees` runs **after** `nablaSwap`, again ensuring fees are denominated in USDC.

## Security Invariants

1. **The fees actually deducted MUST match the fees displayed to the user** — **CURRENTLY VIOLATED**. The token-config fees (actually deducted) and database fees (displayed) are calculated independently and may differ. This must be reconciled.
2. **Fee parameters MUST NOT be client-controllable** — All fee rates (basis points, fixed components) must come from server-side configuration (token config or database), never from request parameters.
3. **Fee calculations MUST use safe decimal arithmetic** — The code uses `Big.js` for fee calculations, avoiding floating-point precision errors. All monetary calculations MUST use arbitrary-precision arithmetic, never native JavaScript `number`.
4. **Negative output amounts MUST be blocked** — If fees exceed the input/output amount, the result must be clamped to zero, never negative. Both helper functions check `totalReceiveRaw.gt(0)` and return `'0'` otherwise.
5. **Fee deduction MUST happen at the correct point in the flow** — On-ramp fees deducted before swap; off-ramp fees deducted after swap. Applying fees at the wrong point changes the effective rate.
6. **Anchor fees MUST be accounted for in the quoted amount** — When BRLA or Stellar anchors deduct their fee, the system's quoted output must have already factored this in. The user should receive exactly the quoted net amount.
7. **Subsidization MUST NOT bypass fee collection** — When the platform subsidizes a shortfall (swap returned less than quoted), the subsidization covers the difference AFTER fees, not before. The platform should not subsidize to offset its own fees.
8. **Fee distribution (`distributeFees` phase) MUST transfer exact calculated amounts** — The amounts sent to vortex, network, and partner fee accounts must match the fee breakdown calculated during quoting.
9. **Rounding MUST be consistent and favor the platform** — On-ramp fees are rounded to 6 decimal places (round half up). Off-ramp fees are rounded to 2 decimal places (round half down). Rounding mode should never create a scenario where the user receives more than entitled.
10. **Fee configuration changes MUST NOT affect in-flight ramps** — Once a quote is created with specific fees, those fees are locked. Changing fee configuration should only apply to new quotes.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Fee discrepancy exploitation** | User sees low fees in the API response (database fees) but is charged higher fees (token-config fees) — or vice versa | **MUST FIX**: Reconcile the two fee systems so displayed fees equal applied fees |
| **Fee bypass via direct quote manipulation** | Attacker modifies fee fields in the quote response before registering a ramp | Fees are recalculated server-side; quote amounts are immutable once stored; the token-config fees are applied regardless of what's in the database |
| **Rounding exploitation** | Attacker crafts amounts that exploit rounding to extract fractional value over many transactions | Rounding modes are specified (`Big.js` roundDown for off-ramp, roundUp for on-ramp); verify these favor the platform |
| **Fee parameter injection** | Attacker passes custom fee rates in the API request | Fee rates come exclusively from `getAnyFiatTokenDetails()` (token config) or database; never from request body |
| **Subsidization drain** | Attacker manipulates conditions so the platform always subsidizes the maximum amount | Slippage bounds limit subsidization; monitoring for excessive subsidization; circuit breaker on total subsidization per period |
| **Partner markup theft** | Partner sets unreasonably high markup to extract value | Partner markup bounds should be enforced; review partner configuration for reasonable limits |

## Audit Checklist

- [EXISTING FINDING] **CRITICAL FINDING F-002**: Verify the exact magnitude of discrepancy between token-config fees and database fees for each currency pair and ramp direction. Document which one the user actually experiences. **EXISTING FINDING** — documented as F-002 (dual fee system discrepancy).
- [x] `calculateTotalReceiveOnramp()` and `calculateTotalReceive()` are the only functions that affect the actual amount the user receives — verify no other fee deduction exists. **PASS** — confirmed: these are the only fee-deducting functions in the output amount calculation.
- [x] `calculateFeeComponents()` results are stored but NOT used for actual deductions — verify this hasn't changed. **PASS** — confirmed: database fee components are for display/logging only.
- [x] All fee calculations use `Big.js` (or equivalent arbitrary-precision library), never native `number`. **PASS** — verified: `Big.js` used throughout fee calculations.
- [N/A] Negative output protection: both fee functions return `'0'` when fees exceed the amount. **N/A** — requires business review to confirm the clamping behavior is intentional for all scenarios.
- [x] On-ramp fee is applied BEFORE the swap (reducing `inputAmount`). **PASS** — verified in the on-ramp flow.
- [Deferred] Off-ramp fee is applied AFTER the swap (reducing swap output). **Deferred to Module 05** — fee application point varies by integration; verified per-integration in Module 05 audits.
- [x] No fee parameter is accepted from the client request body. **PASS** — confirmed: all fee rates come from server-side config.
- [x] Fee configuration from token configs (`shared/src/tokens/*/config.ts`) matches what's intended for each currency. **PASS** — token configs reviewed; basis points and fixed components present for all supported tokens.
- [x] Rounding modes: on-ramp uses `round(6, 0)` (round half up to 6 decimals), off-ramp uses `round(2, 1)` (round half down to 2 decimals). **PASS** — verified rounding modes in both helper functions.
- [x] `distributeFees` phase distributes exactly the amounts from the fee breakdown — no recalculation. **PASS** — fee distribution uses stored breakdown values.
- [x] Anchor fee deduction by external services (BRLA, Stellar) is pre-accounted in the quoted amount. **PASS** — anchor fees factored into quote calculation.
- [ ] Mykobo anchor fee in the quote MUST match the tier Mykobo actually charges. The fee tier is selected by `MYKOBO_CLIENT_DOMAIN`; an unset env var silently degrades to Mykobo's default tier (~5x worse), causing `defaultDepositFee` / `defaultWithdrawFee` and on-chain settlement to diverge. See `07-operations/secret-management.md` (invariant 9) and `05-integrations/mykobo.md` (invariant 20).
- [x] Fee changes in token config or database don't retroactively affect already-created quotes. **PASS** — quotes store immutable fee snapshots at creation time.
- [x] **FINDING F-061 (MEDIUM)**: Verify quote finalization enforces maximum amount limits. **PASS (FIXED)** — added `validateAmountLimits(..., "max", ...)` calls in both `OnRampFinalizeEngine.validate()` and `OffRampFinalizeEngine.validate()`.
- [x] **FINDING F-067 (MEDIUM)**: Verify `calculateFeeComponent()` cannot produce negative fee values. **PASS (FIXED)** — added `if (feeComponent.lt(0)) { feeComponent = new Big(0); }` floor check to clamp negative results to zero.
- [x] EVM branch of `distributeFees` uses `Multicall3.aggregate3` at `0xcA11bde05977b3631167028862bE2a173976CA11`. **PASS** — address constant matches canonical Multicall3 deployment.
- [x] EVM fee handler pre-checks ephemeral ERC-20 balance via `checkEvmBalanceForToken` with `FEE_BALANCE_POLL_TIMEOUT_MS=60s`. **PASS** — verified in `distribute-fees-handler.ts`.
- [x] BRL offramp ordering: `distributeFees` BEFORE `nablaSwap`. **PASS** — verified in `evm-to-brl-base.ts`.
- [x] **Vortex `payout_address_evm` NULL fallback**: `DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS` / `config.defaults.vortexEvmPayoutAddress` is used when the active `vortex` row lacks an EVM payout address.
- [x] **Partner `payout_address_evm` NULL no longer drops markup silently**: BRL-on-Base quote creation rejects partner-markup routes when the partner lacks EVM payout config, and runtime fee distribution logs a warning if the condition slips through.
