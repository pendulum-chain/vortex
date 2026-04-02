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
- **Anchor fees** (BRLA, Stellar) are deducted by the external anchor during the anchor interaction phase — the system must account for this deduction.
- **Platform fees** (vortex, network, partner markup) are distributed during the `distributeFees` phase.

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

- [ ] **CRITICAL FINDING**: Verify the exact magnitude of discrepancy between token-config fees and database fees for each currency pair and ramp direction. Document which one the user actually experiences.
- [ ] `calculateTotalReceiveOnramp()` and `calculateTotalReceive()` are the only functions that affect the actual amount the user receives — verify no other fee deduction exists
- [ ] `calculateFeeComponents()` results are stored but NOT used for actual deductions — verify this hasn't changed
- [ ] All fee calculations use `Big.js` (or equivalent arbitrary-precision library), never native `number`
- [ ] Negative output protection: both fee functions return `'0'` when fees exceed the amount
- [ ] On-ramp fee is applied BEFORE the swap (reducing `inputAmount`)
- [ ] Off-ramp fee is applied AFTER the swap (reducing swap output)
- [ ] No fee parameter is accepted from the client request body
- [ ] Fee configuration from token configs (`shared/src/tokens/*/config.ts`) matches what's intended for each currency
- [ ] Rounding modes: on-ramp uses `round(6, 0)` (round half up to 6 decimals), off-ramp uses `round(2, 1)` (round half down to 2 decimals)
- [ ] `distributeFees` phase distributes exactly the amounts from the fee breakdown — no recalculation
- [ ] Anchor fee deduction by external services (BRLA, Stellar) is pre-accounted in the quoted amount
- [ ] Fee changes in token config or database don't retroactively affect already-created quotes
