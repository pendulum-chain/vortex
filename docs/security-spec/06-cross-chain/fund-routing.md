# Fund Routing — Subsidization & Settlement

## What This Does

Fund routing covers the mechanisms by which the platform ensures ephemeral accounts have the correct token amounts at each stage of a ramp. This includes **subsidization** (topping up ephemeral accounts with platform funds) and **final settlement** (transferring tokens from EVM ephemeral accounts to the user's destination).

There are now **five** subsidization-related phase handlers and one settlement phase, split between Substrate (Pendulum) and EVM (Base + legacy chains):

**Phase handlers (Substrate):**
- `subsidize-pre-swap-handler.ts` — Tops up the Pendulum ephemeral before a Nabla swap to ensure it has the expected input amount
- `subsidize-post-swap-handler.ts` — Tops up the Pendulum ephemeral after a Nabla swap. Also contains complex next-phase routing logic.
- `final-settlement-subsidy.ts` — Tops up an EVM ephemeral by SquidRouter-swapping native → ERC-20 (legacy / cross-chain settlement). Has a USD cap (`MAX_FINAL_SETTLEMENT_SUBSIDY_USD`).
- `destination-transfer-handler.ts` — Sends the presigned EVM transfer from the ephemeral to the user's destination address

**Phase handlers (EVM):** The Substrate handlers above are polymorphic: `subsidize-pre-swap-handler.ts` and `subsidize-post-swap-handler.ts` dispatch to their EVM branches when the ephemeral involved is on a supported EVM chain (currently Base). The EVM branches top the ephemeral up before/after `nablaSwap` (EVM branch) and enforce the quote-relative USD cap `MAX_EVM_SWAP_SUBSIDY_QUOTE_FRACTION`.

**How subsidization works:**
1. Read the ephemeral account's current balance
2. Compare against the expected amount (from ramp state metadata, e.g. `quote.metadata.nablaSwapEvm.inputAmountForSwapRaw` for pre-swap on the EVM branch)
3. If balance < expected, transfer the difference from the **funding account** (a platform-controlled account with pooled funds)
4. The funding account is derived from `FUNDING_SECRET` / `PENDULUM_FUNDING_SEED` (Pendulum/Stellar) or `EVM_FUNDING_PRIVATE_KEY` through `getEvmFundingAccount(network)` (EVM — used on **Moonbeam, Base, and any other EVM chain**; `MOONBEAM_EXECUTOR_PRIVATE_KEY` remains a backward-compatible fallback)

**Why this matters for security:** Subsidization uses platform funds. If the amount calculations are wrong, the expected amounts are manipulated, or cap enforcement fails, the platform loses money. The funding accounts hold pooled assets — their compromise would affect all ramps, not just one.

### EVM funding key scope

The EVM funding key is used on **all EVM chains** the platform operates on:
- Moonbeam (EUR/USD subsidization)
- Base (BRL on/off-ramp pre/post-swap subsidization)
- Destination chain `backupApprove` spender for BRL on-ramp (`avenia-to-evm-base.ts`)

The current code resolves this through `EVM_FUNDING_PRIVATE_KEY` and the `getEvmFundingAccount(network)` helper. The legacy Moonbeam-named env var is only a compatibility fallback and should be phased out operationally so the key's Base/EVM-wide blast radius stays visible.

## Security Invariants

1. **Subsidization MUST only top up to the expected amount, never more** — Both `subsidize-pre-swap-handler.ts` and `subsidize-post-swap-handler.ts` calculate `expectedAmount - currentBalance` and transfer exactly that difference. If the balance already meets or exceeds the expected amount, no transfer occurs.
2. **Expected amounts MUST come from ramp state set at creation time** — The expected input/output amounts are derived from the quote and stored in ramp state. Handlers read these values, not recalculate them. This prevents manipulation via price changes between quote and execution.
3. **Funding account private keys MUST only be used for subsidization transfers** — `getFundingAccount()` derives a keypair from `PENDULUM_FUNDING_SEED`. This keypair should only sign subsidization transfers, not arbitrary transactions.
4. **Final settlement subsidy MUST enforce a USD cap** — `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` limits the maximum value the platform will subsidize per EVM settlement.
5. **Destination transfer MUST use a presigned transaction** — `destination-transfer-handler.ts` submits the presigned transfer from state. The server cannot modify the recipient address or amount at execution time.
6. **Destination transfer MUST verify balance before submission** — The handler checks that the ephemeral has sufficient balance for the transfer. If insufficient, the phase fails rather than submitting a transaction that would revert.
7. **Post-swap subsidization next-phase routing MUST be deterministic** — `subsidize-post-swap-handler.ts` contains branching logic that selects the next phase based on ramp direction (on/off), destination chain, and output token. This routing must be consistent with the flow defined at ramp creation.
8. **No subsidization handler MUST proceed if the funding account has insufficient balance** — If the funding account cannot cover the subsidy, the handler should fail with a recoverable error, not silently skip the top-up.
9. **EVM subsidy caps MUST stop transfers without forcing manual phase repair** — If an EVM pre/post-swap subsidy exceeds the quote-relative cap, the handler must not submit a transfer. The cap breach is intentionally recoverable so operators can investigate, top up, or cancel the ramp without repairing an unrecoverably failed phase.
10. **`finalSettlementSubsidy` MUST subsidize the gap to *actual bridge delivery*, not to the ephemeral's total balance** — The subsidy is `expectedAmountRaw - delivered`, where `delivered = actualBalance - preSettlementBalance` and `preSettlementBalance` is the destination-token balance snapshotted right after the `squidRouterSwap` confirms (before `squidRouterPay`). Computing the subsidy from total balance is unsafe: leftover Nabla-swap dust in the destination token would make the handler return early and over-subsidize before the Squid bridge output has landed. To avoid racing the bridge, the balance poll waits for ≥90% of `expectedAmountRaw` to arrive (the 90% floor absorbs bridge slippage while still confirming the bridge actually delivered) rather than returning on any non-zero balance. (Incident: a EUR→EURC Base ramp was over-funded ~29.36 EURC and stranded ~59 EURC because the pre-fix handler returned on dust and subtracted total balance.)
11. **Degenerate same-token settlement routes MUST skip `finalSettlementSubsidy` entirely** — When the ramp is a direct transfer (`state.state.isDirectTransfer === true`) or a EUR→EURC-on-Base route (`isEurToEurcBaseDirect`), the handler short-circuits to `destinationTransfer` without subsidizing. There is no Squid bridge to settle, so any subsidy computation would be against a balance the funder never needs to top up.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Final settlement subsidy cap bypass** — A missing or bypassed `throw` on the USD cap would allow a single ramp to drain the funding account's native token balance via an unbounded SquidRouter swap. | **Mitigated.** `final-settlement-subsidy.ts` throws when `requiredNativeInUsd > MAX_FINAL_SETTLEMENT_SUBSIDY_USD`; keep this as a regression check because the blast radius is direct funding-key loss. |
| **Funding account balance drain** — Repeated ramps with incorrect expected amounts could drain the funding account | Expected amounts are bound to the quote at creation time. An attacker cannot change them after the fact. However, a bug in quote calculation or a stale price could result in over-subsidization at scale. |
| **Expected amount manipulation** — Attacker modifies ramp state to inflate expected amounts, causing the platform to over-subsidize | Ramp state expected amounts are set at creation and not modifiable via the API. An attacker would need database access. No DB-level constraint prevents modifying these values. |
| **Funding key compromise** — Attacker obtains `PENDULUM_FUNDING_SEED` or `MOONBEAM_FUNDING_PRIVATE_KEY` | Full drain of the funding account. These keys should be rotated immediately on suspicion of compromise. There is no rate limiting on funding account transactions at the chain level. |
| **SquidRouter swap manipulation in final settlement** — The SquidRouter swap (native → ERC-20) uses an API-provided route. If the SquidRouter API returns a malicious route, funds could be lost. | The handler trusts the SquidRouter API response. There is no independent verification that the swap output matches expectations. The 5-attempt retry loop could amplify losses if the route is consistently malicious. |
| **Destination transfer replay** — The presigned EVM transaction is somehow submitted multiple times | EVM nonce prevents replay. Each transaction is valid for exactly one nonce value. |
| **Balance check race condition in destination transfer** — Balance changes between the check and the transaction submission | Possible but unlikely for ephemeral accounts (no other senders). If balance drops between check and submission, the EVM transaction reverts (no fund loss, just a failed phase that retries). |
| **Post-swap routing logic inconsistency** — The next-phase selection in `subsidize-post-swap-handler.ts` routes to a phase that doesn't match the ramp's intended flow | Routing logic uses `direction`, `toChain`, and `outputTokenType` from ramp state. A mismatch would cause the ramp to enter an unexpected phase. Since phases are handler-specific, executing the wrong phase could fail or produce incorrect results. |
| **Final settlement over-subsidy race** — `finalSettlementSubsidy` returns as soon as *any* destination-token balance appears (e.g. Nabla-swap dust) and computes `subsidy = expected − totalBalance` before the Squid bridge output lands. The funder then tops up the full expected amount on top of the later bridge delivery, double-paying the ephemeral and stranding the excess. | **Mitigated.** The handler now snapshots `preSettlementBalance` after `squidRouterSwap` confirms, waits for ≥90% of `expectedAmountRaw` to arrive, and subsidizes only `expected − (actualBalance − preSettlementBalance)`. Direct-transfer / EUR→EURC-Base routes skip the phase outright. Regression-test this: the failure mode silently over-pays from the funding key. |

## Audit Checklist

- [x] **F-001 fixed**: `final-settlement-subsidy.ts` throws the cap error when `requiredNativeInUsd > MAX_FINAL_SETTLEMENT_SUBSIDY_USD`; the cap is enforced before the Squid swap is submitted.
- [x] Verify `subsidize-pre-swap-handler.ts` calculates subsidy as `expectedAmount - currentBalance` and transfers exactly that amount. **PASS** — difference calculation and exact transfer confirmed.
- [x] Verify `subsidize-post-swap-handler.ts` calculates subsidy the same way — no off-by-one, no rounding errors. **PASS** — same calculation pattern confirmed.
- [x] Verify both pre/post swap handlers skip subsidization when `currentBalance >= expectedAmount` (no negative transfers). **PASS** — skip condition verified in both handlers.
- [x] Verify `getFundingAccount()` derives the keypair from `PENDULUM_FUNDING_SEED` and this seed is not reused for other purposes. **PASS** — seed used only for funding account derivation.
- [FAIL] Verify `MOONBEAM_FUNDING_PRIVATE_KEY` is used only for EVM subsidization, not other Moonbeam operations. **FAIL F-029** — `MOONBEAM_FUNDING_PRIVATE_KEY` equals `MOONBEAM_EXECUTOR_PRIVATE_KEY`; same key used for funding, executor, legacy Monerium signing, Mykobo-related Base operations, and SquidRouter operations. With the BRL-on-Base and EUR-on-Base (Mykobo) flows this key is now also used for ephemeral subsidization on Base, BRLA + Mykobo EURC payouts on Base, and EVM fee distribution on Base — a single private key compromise drains funds across Moonbeam, Base, Polygon, and any other EVM chain in scope, including the dedicated BRLA and Mykobo payout paths.
- [x] Verify `destination-transfer-handler.ts` checks ephemeral balance before submitting the presigned transaction. **PASS** — balance check before submission confirmed.
- [x] Verify the presigned destination transfer is submitted as-is — no server-side modification of recipient or amount. **PASS** — presigned transaction submitted unmodified.
- [PARTIAL] Verify `final-settlement-subsidy.ts` SquidRouter swap: check that the swap input amount is bounded and that the swap output is verified against expectations. **PARTIAL** — input amount is capped (F-001 fixed); no output verification against expectations.
- [FAIL] Verify the 5-attempt retry loop in `final-settlement-subsidy.ts` does not retry on swap failures that indicate a malicious route (e.g., output far below expected). **FAIL F-030** — retry loop retries all failures uniformly; no distinction between transient errors and potentially malicious routes.
- [PARTIAL] Verify `subsidize-post-swap-handler.ts` next-phase routing logic covers all valid combinations of `direction`, `toChain`, and `outputTokenType` — no unhandled cases that silently proceed. **PARTIAL F-031** — routing logic covers known combinations but no default/exhaustive error for unhandled combinations.
- [FAIL] Verify funding account balance is checked before subsidization — insufficient balance should fail the phase, not silently skip. **FAIL F-032** — no pre-check of funding account balance; insufficient balance causes transaction revert at chain level, not a graceful phase error.
- [N/A] Check whether there is any monitoring or alerting on funding account balance depletion. **N/A** — no monitoring infrastructure audited.
- [x] Verify `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` value is reasonable for the expected settlement amounts (check the constant's actual value). **PASS** — value reviewed and reasonable for expected settlement sizes.
- [x] **FINDING F-060 (MEDIUM)**: Verify `validateSubsidyAmount` rejects negative, zero, NaN, and Infinity amounts. **PASS (FIXED)** — added try/catch around `Big()` construction to reject non-numeric strings, and `lte(0)` guard to reject zero and negative values.
- [x] **EVM subsidy handlers (`subsidize-pre-swap-evm-handler.ts`, `subsidize-post-swap-evm-handler.ts`) enforce a USD cap** via `MAX_EVM_SWAP_SUBSIDY_QUOTE_FRACTION`; over-cap subsidies throw `RecoverablePhaseError` before any transfer is submitted, leaving the ramp waiting for operator action instead of moving to `failed`.
- [x] **`MOONBEAM_FUNDING_PRIVATE_KEY` rename/refactor**: EVM funding now uses the `EVM_FUNDING_PRIVATE_KEY` / `getEvmFundingAccount(network)` path, with the old env name retained only as backward-compatible fallback.
- [x] **`finalSettlementSubsidy` subsidizes against actual bridge delivery, not total balance.** **PASS** — snapshots `preSettlementBalance` after `squidRouterSwap` confirms (`squid-router-phase-handler.ts`, stored in `meta-state-types.ts`), waits for ≥90% of `expectedAmountRaw`, and computes `subsidy = expected − (actualBalance − preSettlementBalance)`. Prevents the dust-triggered over-subsidy race that stranded ~59 EURC.
- [x] **`finalSettlementSubsidy` short-circuits degenerate same-token routes.** **PASS** — returns to `destinationTransfer` when `state.state.isDirectTransfer === true` or `isEurToEurcBaseDirect(...)`, so no subsidy is computed for routes that have no Squid bridge to settle.
