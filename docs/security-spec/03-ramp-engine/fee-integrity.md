# Fee Integrity

## What This Does

Fee calculation determines how much the user pays for a ramp operation and how that payment is distributed. This is a **critical financial security concern** because incorrect fee handling directly impacts user funds and platform revenue.

There is a **single fee engine**: fees are computed once at quote time, snapshotted immutably on the quote, and every later consumer — the API response, the swap-input deduction, and on-chain distribution — reads that same snapshot. (A historical dual system — token-config fees deducted vs. database fees displayed, tracked as F-002 — was retired; the functions it named, `calculateTotalReceiveOnramp()`/`calculateTotalReceive()`, no longer exist. See `FINDINGS.md` for the history.)

### Fee pipeline

1. **Canonical inputs** (`quote/core/quote-fees.ts`):
   - **Vortex fee and partner markup** come from the pricing row resolved by `findPartnerWithPricing` (`partner_pricing_configs`: `vortexFeeType`/`vortexFeeValue`, `markupType`/`markupValue`/`markupCurrency`). Without a quote partner, the `vortex` partner's own config applies; a missing vortex config fails quote creation.
   - **Anchor (processing) fee** is the provider's real charge, taken from the provider quote in each corridor's fee engine: Avenia payout-quote delta (BRL off-ramp), Avenia mint+transfer fees (BRL on-ramp), Mykobo `/fees` (EUR), Alfredpay quote fee (USDT corridors). `calculateFeeComponents` also derives an anchor fee from the `anchors` DB table, but every live corridor overrides it with the provider value — the DB-derived anchor is currently dead weight.
   - **Network fee** is the Squid bridge estimate in USD where a bridge leg exists, `0` on direct corridors, and a hardcoded `0.03` USD on the BRL→AssetHub on-ramp (`FIXME` in code).
2. **Fee currency and conversion**: `feeCurrency` is the corridor's target fiat (input currency for BUY, output currency for SELL). All conversions go through `priceFeedService.convertCurrency` (CoinGecko for crypto, FastForex for fiat). `assignFeeSummary` (`engines/fee/index.ts`) is the **only** writer of `ctx.fees` and converts every component into both USD and display fiat in one pass: `ctx.fees = { usd, displayFiat, vortexFeePenPercentage }`.
3. **Immutable snapshot**: the finalize engine persists the whole quote context as `quote_tickets.metadata` (JSONB); the fee snapshot lives at `metadata.fees`. No code path mutates it after creation — pinned by `fee-immutability.invariants.test.ts` (client fee fields ignored at creation, snapshot byte-identical across registration, status endpoint serves creation-time fees).
4. **Deduction points** (per corridor family — there is deliberately no universal ordering):
   - **Off-ramps (SELL)**: vortex + partner markup are subtracted from the Nabla swap input at quote time (`preNabla.deductibleFeeAmountInSwapCurrency`), and the `distributeFees` phase runs **before** the swap so fees are taken in USDC.
   - **On-ramps (BUY)**: nothing is deducted before the swap (`getDeductibleFeeAmount` returns 0); `distributeFees` runs **after** the swap, again in USDC.
   - **Anchor fees** are collected by the provider off-chain (netted out of mint/payout) and are never distributed on-chain by Vortex.
   - **Alfredpay corridors (MXN/COP/ARS/USD)** have **no `distributeFees` phase**: only the provider fee is actually charged; displayed vortex/partner fees are not collected on-chain (see checklist).
5. **Distribution** (`distribute-fees-handler.ts` + `transactions/common/feeDistribution.ts`): a presigned transaction built at registration transfers `network + vortex + partnerMarkup` (never anchor) from the ephemeral, in USDC, on Base (EVM, single `transfer` or Multicall3 `aggregate3` at `0xcA11bde05977b3631167028862bE2a173976CA11`) or Pendulum (`utility.batchAll` of `transferKeepAlive`, plus optional USDC→PEN buyback of a `vortexFeePenPercentage` slice via Zenlink). The handler pre-checks the ephemeral's token balance (60 s poll) and picks the chain from `metadata.nablaSwapEvm`. Distributed fees are final: there is **no refund or recovery path** if the ramp fails in a later phase.
6. **Amounts vs. destinations**: distributed **amounts** come from the `metadata.fees.usd` snapshot; payout **addresses** are resolved by a fresh `findPartnerWithPricing` read at transaction-build time (vortex + network → vortex row's `payout_address_*`, with `config.defaults.vortexEvmPayoutAddress` fallback on EVM; markup → the pricing partner's address, `pricing_partner_id ?? partner_id`). A payout-address rotation therefore applies to already-created quotes; a pricing-value change does not.

**FIXED (2026-07-05)**: on the direct fiat → own-stablecoin corridors (BRL→BRLA and EUR→EURC on Base), the displayed network fee previously priced a USDC→output-token Squid bridge that the direct route never executes; `OnRampAveniaToEvmFeeEngine` now reports zero network fee there. Pinned by the quote pricing goldens.

### Rounding

Big.js modes: `0` = round-down (truncate), `1` = round-half-up (also the default when the mode argument is omitted), `2` = round-half-even, `3` = round-up. Current usage:

| Point | Call | Mode |
|---|---|---|
| Quote fee components (fiat, 2 dp) | `quote-fees.ts` `.toFixed(2)` | half-up |
| `usd.total` (6 dp) / `displayFiat.total` (2 dp) | `fee/index.ts` `.toFixed(6)` / `.toFixed(2)` | half-up |
| Swap input raw | `nabla-swap/index.ts` `.toFixed(0)` | half-up |
| Substrate distribution raw | `feeDistribution.ts` `.toFixed(0, 0)` | round-down |
| EVM distribution raw | `feeDistribution.ts` `.toFixed(0)` | half-up ⚠ inconsistent with substrate |
| Provider-side swap outputs / Alfredpay raw | `.toFixed(2, 0)` / `.toFixed(0, 0)` | round-down |

## Security Invariants

1. **Displayed and deducted fees MUST derive from one snapshot** — `assignFeeSummary` is the only writer of `ctx.fees`; the API response reads `metadata.fees.displayFiat`/`.usd` and distribution reads `metadata.fees.usd`. No component may recompute fees from configuration at execution time (payout *addresses* are the sole deliberate exception, see invariant 11).
2. **Fee parameters MUST NOT be client-controllable** — all fee rates come from server-side configuration (pricing rows, provider quotes), never from request parameters. Client-supplied fee fields are ignored at quote creation.
3. **Fee calculations MUST use safe decimal arithmetic** — `Big.js` throughout; never native JavaScript `number`.
4. **Negative fee components MUST be clamped to zero** (F-067) — `calculateFeeComponent` floors negative results at 0.
5. **Fee deduction and distribution order is defined per corridor, matching the currency fees were quoted in** — SELL: pre-swap in USDC; BUY: post-swap in USDC; anchor: provider-side. There is no universal "fees last" rule; each route's phase sequence is the authority (`ramp-phase-flows.md`).
6. **Anchor fees MUST be pre-accounted in the quoted output** — the provider's cut is netted into the quote so the user receives the quoted amount; Vortex never moves the anchor fee on-chain.
7. **Subsidization MUST NOT bypass fee collection** — subsidies cover post-fee shortfalls; the platform does not subsidize to offset its own fees.
8. **Distribution MUST transfer exactly the snapshot amounts** — `network + vortex + partnerMarkup` from `metadata.fees.usd`, converted to USDC raw at the documented rounding mode. No recalculation.
9. **Partner markup distribution MUST use pricing attribution** — payout resolves through `pricing_partner_id ?? partner_id` so profile-assigned quotes pay the partner whose rate was used.
10. **Rounding MUST be consistent and favor the platform** — raw on-chain amounts should truncate (round-down). The EVM distribution path currently uses half-up (`toFixed(0)` default) and MUST be aligned with the substrate path's round-down (open item below).
11. **Pricing changes MUST NOT affect in-flight quotes; address rotations DO** — fee amounts are locked in the snapshot at creation. Payout addresses are deliberately live-read at build time so an address rotation takes effect for existing quotes; a missing vortex row/address at build time fails the build rather than misrouting funds.
12. **Displayed discount MUST NOT hide charged fee components** — if a quote includes a subsidized rate improvement, clients may display the benefit as a separate discount line and an effective total, but the underlying charged fee fields (`processingFeeFiat`, `networkFeeFiat`, `partnerFeeFiat`, API `totalFeeFiat`) MUST remain unchanged. The discount is a platform-funded benefit, not negative revenue.
13. **Displayed totals and distributed totals differ by design** — the API `total` includes the anchor fee; on-chain distribution excludes it (the provider already took it). Reconciliation must compare `network + vortex + partnerMarkup` on-chain against the snapshot, and the anchor against provider statements.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Fee bypass via quote manipulation** | Attacker sends fee fields in the quote request or smuggles them into registration `additionalData` | Fees computed server-side only; snapshot immutable after creation; pinned by `fee-immutability.invariants.test.ts` |
| **Rounding exploitation** | Attacker crafts amounts that exploit rounding to extract fractional value over many transactions | Raw distribution amounts truncate on substrate; EVM path to be aligned (invariant 10); per-unit exposure is ≤ 1 raw unit per transfer |
| **Fee parameter injection** | Attacker passes custom fee rates in the API request | Fee rates come exclusively from pricing rows and provider quotes; never from the request body |
| **Payout misdirection via config change** | Compromised admin rotates the vortex/partner payout address; existing quotes pay the new address | Addresses are live-read by design (invariant 11); admin routes are the control point (`admin-auth.md`); monitor payout-address changes |
| **Partner markup theft** | Partner sets an unreasonably high markup | Markup bounds should be enforced at config creation; review partner configuration for limits |
| **Profile-priced markup not paid** | A profile-assigned quote is user-owned (`partner_id = NULL`) but priced by a partner row | Fee distribution resolves the payout partner from `pricing_partner_id ?? partner_id` |
| **Silent revenue loss** | Corridors or configs where computed fees are never collected | Alfredpay corridors have no `distributeFees` phase; EVM/substrate paths drop partner markup when the partner row lacks a payout address (logged). Both tracked in the checklist |

## Audit Checklist

- [x] `assignFeeSummary` is the only writer of `ctx.fees`; API response and distribution both read the `metadata.fees` snapshot. **PASS** — verified in `engines/fee/index.ts`, `finalize/index.ts` (`buildQuoteResponse`), `feeDistribution.ts`.
- [x] All fee calculations use `Big.js`, never native `number`. **PASS**.
- [x] No fee parameter is accepted from the client request body; snapshot survives registration unchanged. **PASS** — `fee-immutability.invariants.test.ts`.
- [x] Negative fee components clamped to zero (F-067). **PASS (FIXED)**.
- [x] Off-ramp pre-Nabla deduction subtracts exactly vortex + partner markup in swap currency; on-ramp deducts nothing pre-swap. **PASS** — `nabla-swap/index.ts` `getDeductibleFeeAmount`.
- [x] BRL offramp ordering: `distributeFees` BEFORE `nablaSwap`. **PASS** — `evm-to-brl-base.ts` presigned nonce order; on-ramps distribute after the swap (`nabla-swap-handler.ts`).
- [x] Distribution transfers `network + vortex + partnerMarkup` from the snapshot; anchor never distributed. **PASS** — `feeDistribution.ts`, `computeRequiredFeeRaw`.
- [x] EVM branch uses Multicall3 `aggregate3` at `0xcA11bde05977b3631167028862bE2a173976CA11`; ephemeral balance pre-checked via `checkEvmBalanceForToken` (60 s). **PASS**.
- [x] Partner markup payout uses the pricing partner when present. **PASS** — `pricing_partner_id ?? partner_id`.
- [x] **Vortex `payout_address_evm` NULL fallback**: `config.defaults.vortexEvmPayoutAddress` is used when the active `vortex` row lacks an EVM payout address; a missing vortex pricing row fails the build. **PASS**.
- [x] Partner `payout_address_evm` NULL no longer drops markup silently at quote time: BRL-on-Base quote creation rejects partner-markup routes without payout config; runtime logs a warning if the condition slips through. **PASS**.
- [x] Fee/pricing changes don't retroactively change amounts for already-created quotes. **PASS** — amounts read from `metadata.fees.usd` snapshot.
- [ ] **OPEN — Alfredpay fee collection gap**: MXN/COP/ARS/USD corridors display vortex/partner fees but have no `distributeFees` phase; the amounts are never collected on-chain. Decide: add distribution to these routes, or zero the uncollected components in their fee engines so display matches reality.
- [ ] **OPEN — EVM raw rounding**: `feeDistribution.ts` EVM path uses `toFixed(0)` (half-up) where substrate truncates (`toFixed(0, 0)`). Align on round-down (invariant 10).
- [ ] **OPEN — dead DB anchor fee**: `calculateFeeComponents` derives an anchor fee from the `anchors` table that every live corridor overrides with the provider value. Remove the dead computation or document which corridor is meant to use it.
- [ ] Mykobo anchor fee in the quote MUST match the tier Mykobo actually charges. The fee tier is selected by `MYKOBO_CLIENT_DOMAIN`; an unset env var silently degrades to Mykobo's default tier (~5x worse), causing `defaultDepositFee` / `defaultWithdrawFee` and on-chain settlement to diverge. See `07-operations/secret-management.md` (invariant 9) and `05-integrations/mykobo.md` (invariant 20).
- [ ] Mykobo `/fees` outage during quote creation surfaces as `QuoteError.AnchorTemporarilyUnavailable` (`503`), not a generic failure. The optional env-gated display fallback (`MYKOBO_FEE_FALLBACK_ENABLED` → flat `MYKOBO_FALLBACK_DEPOSIT_FEE` / `MYKOBO_FALLBACK_WITHDRAW_FEE`) is **display-only** and MUST NOT price a ramp execution; a fallback-priced quote MUST re-validate the live Mykobo fee before a rail runs (EUR registration is currently disabled). See `05-integrations/mykobo.md` (invariant 26).
- [x] **FINDING F-061 (MEDIUM)**: quote finalization enforces maximum amount limits. **PASS (FIXED)** — `validateAmountLimits(..., "max", ...)` in both finalize engines.
