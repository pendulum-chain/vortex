# Squid Router Integration

## What This Does

Squid Router is a cross-chain swap/routing protocol built on Axelar's General Message Passing (GMP). Vortex uses it for:
- **BRL on-ramp**: Base USDC → user's destination EVM chain (any token).
- **BRL off-ramp**: User's source EVM chain → Base USDC.
- **EUR on-ramp (Mykobo on Base)**: Base USDC → user's destination EVM chain (after EURC→USDC Nabla swap).
- **EUR off-ramp (Mykobo on Base)**: User's source EVM chain → Base USDC (client-side user-signed).
- **Alfredpay on-ramp**: Polygon Alfredpay token → user's destination EVM chain/token, except for Polygon same-token passthrough.
- **Off-ramp permit acquisition (Alfredpay)**: User source EVM → Polygon via the source-chain `TokenRelayer.execute()` with EIP-2612 permit.

> **Removed:** the previous Monerium-EUR Squid usage (Polygon EURe → Moonbeam) is no longer active; Monerium is deprecated (see `monerium.md`).

It handles cross-chain swap execution, Axelar bridge status monitoring, and gas subsidization on the destination chain.

**Provider type:** Cross-chain router
**Chains involved:** Base, Polygon, Moonbeam, Ethereum, Arbitrum, BSC, Avalanche, etc. (any EVM destination supported by Squid)
**Phase handlers:**
- `squid-router-phase-handler.ts` — Submits presigned approve + swap transactions on the source EVM chain.
- `squid-router-pay-phase-handler.ts` — Monitors Axelar bridge status, funds Axelar gas, waits for cross-chain settlement (with finite arrival timeout). Honors the phase processor's `AbortSignal` so timed-out executions stop polling instead of leaking loops against the Squid rate limit. When axelarscan reports a failed validator confirmation poll (`status: "called"` + `confirm_failed` — Axelar's relayer never retries these), it auto-recovers by fetching a signed `ConfirmGatewayTx` from Axelar's public recovery signing service and broadcasting it to the Axelar RPC (`recoverAxelarStuckConfirm` in shared). This uses only the public tx hash — no Vortex keys sign anything and no funds move; attempts are rate-limited by a cooldown timestamp persisted in ramp state (`axelarConfirmRecoveryAt`).
- `squidrouter-permit-execution-handler.ts` — Calls `TokenRelayer.execute()` with EIP-2612 permit + payload for off-ramp permit flows. Also handles the no-permit fallback path where the user's wallet submits the substituting transactions directly.

### On-ramp flow (BRL onramp post-Nabla, e.g. Base USDC → user's Polygon ERC-20)

1. After `nablaSwap` + `distributeFees` on Base.
2. `squidRouterApprove` (Base): approve the Squid router for Base USDC.
3. `squidRouterSwap` (Base): submit Squid swap call.
4. `squidRouterPay`: poll Axelar GMP status + ephemeral balance on destination chain via `Promise.any` race; fund Axelar gas with `addNativeGas`; arrival is bounded by a finite timeout.
5. Optional `backupSquidRouterApprove` / `backupSquidRouterSwap` on the destination chain if the bridged token (axlUSDC / USDC) needs further conversion to the user's requested output token. **F-054: these `backup*` presigned txs have no registered phase handler.**
6. `destinationTransfer` to the user.

For quote metadata, Squid's `route.estimate.toAmount` is already denominated in the **destination token's raw units**. The bridge metadata (`evmToEvm.outputAmountRaw`, `moonbeamToEvm.outputAmountRaw`, etc.) MUST preserve that raw value directly instead of rebuilding it from the human-readable decimal amount with source-token decimals. This matters for routes like Base USDC (6 decimals) → BSC USDT (18 decimals), where using the source decimals would under-scale the metadata by 12 decimal places. The same invariant applies to routed Alfredpay onramps: even when the Squid source is the Polygon-minted Alfredpay token, `route.estimate.toAmount` remains authoritative for the destination token's raw units and `quote.outputAmount` must retain destination-token precision.

### Off-ramp flow (user EVM source → Base USDC)

1. User signs one of three paths (depending on source ERC-20 capabilities and direction):
   - **Permit path**: EIP-2612 permit + payload typed data → `squidRouterPermitExecute` → source-chain `TokenRelayer.execute()` pulls funds, approves Squid, calls swap atomically. Gas is paid by the configured executor key through a wallet client for `fromNetwork`.
   - **No-permit fallback** (`isNoPermitFallback=true`): user's own wallet broadcasts `squidRouterNoPermitApprove` + `squidRouterNoPermitSwap` (or `squidRouterNoPermitTransferHash` for direct-transfer subcase). Frontend reports the resulting tx hashes back via `UpdateRampRequest.additionalData`. Backend awaits receipts via `waitForUserHash`. **No presigned-tx validation runs for these phases** — they are user-submitted (see `transaction-validation.md`).
   - **Direct transfer** (`isDirectTransfer=true`): same-chain same-token, user wallet submits a direct ERC-20 transfer to the Base ephemeral.
2. `squidRouterPay`: monitors Axelar GMP for arrival on Base.
3. Continues with offramp Nabla swap on Base.

### Skip-Squid trivial path

When the BRL on-ramp's destination is **Base + USDC**, the Nabla swap output is already the requested output token. The route builder in `avenia-to-evm-base.ts` skips the `squidRouterApprove`/`squidRouterSwap`/`backup*` presigned transactions entirely and emits only a `destinationTransfer`. The quote engine `BaseSquidRouterEngine` (`squidrouter/index.ts`) emits 1:1 passthrough bridge meta with `networkFeeUSD = "0"` so downstream stages (discount, finalize) work without fetching a Squid route (which would fail with "same token same chain"). Discount engine (`onramp.ts`) and fee engine (`onramp-brl-to-evm.ts`) likewise short-circuit to a 1:1 rate / zero network fee in this case.

**No security checks are bypassed by this path** — destination address validation runs in the quote `validate` step regardless; the only thing skipped is the Squid HTTP call.

## Security Invariants

1. **Approve transaction MUST be confirmed before swap execution** — Approve hash persisted to state immediately for crash recovery.
2. **Bridge status uses dual-check (Squid + Axelar fallback)** — If Squid status API fails, falls back to `getStatusAxelarScan()`. Both must fail before phase errors.
3. **Balance check and bridge check MUST race via `Promise.any`** — Either balance arriving or bridge reporting success is sufficient; both must fail (`AggregateError`) to error.
4. **Arrival check MUST have a finite timeout** — `getSquidRouterPayTimeoutMs()` bounds both destination-balance and bridge-status polling at 80% of the phase processor timeout (8 minutes by default). Both checks also honor the processor's `AbortSignal`.
5. **Squid API rate-limit responses MUST be retried with backoff** — 429 responses are retried with exponential backoff before failing the phase. Other errors propagate directly.
6. **Axelar gas funding MUST use `addNativeGas` on the correct chain** — The funding source/chain is selected based on the route, not from request input.
7. **Permit execution MUST verify both permit and payload signatures** — `squidRouterPermitExecute` extracts v/r/s from both `permitTypedData` and `payloadTypedData`; both must be valid `SignedTypedData`.
8. **The configured executor key is the relayer caller on the source EVM network** — It funds gas only; MUST NOT hold user funds.
9. **No-permit fallback MUST verify on-chain receipt for every reported user hash** — `waitForUserHash` calls `waitForTransactionReceipt`; non-success status throws `RecoverablePhaseError`. The user-reported hash itself is trusted (no signature verification — the receipt confirms it succeeded, which is sufficient because the user controls the source funds either way).
10. **No-permit fallback MUST NOT advance to `fundEphemeral` until BOTH approve and swap (or the direct transfer) have confirmed** — Sequential `waitForUserHash` calls in `executeNoPermitFallback` enforce this.
11. **Transaction hashes MUST be persisted to state before waiting** — `squidRouterApproveHash`, `squidRouterSwapHash`, `squidRouterPayTxHash`, `squidRouterPermitExecutionHash`, `squidRouterNoPermitApproveHash`, `squidRouterNoPermitSwapHash`, `squidRouterNoPermitTransferHash` all enable crash recovery.
12. **Skip-Squid path MUST NOT lose destination validation** — Quote engine `validate()` runs regardless of `skipRouteCalculation`; `destinationTransfer` is the only on-chain step that fires.
13. **Squid output raw metadata MUST use destination-token raw units** — `route.estimate.toAmount` is the authoritative destination raw output; `evmToEvm.outputAmountRaw` MUST NOT be recomputed with the source token's decimals. For same-chain same-token passthrough, `inputAmountRaw` is also the destination raw amount and is safe to mirror. Routed Alfredpay onramps follow the same rule; only direct Polygon same-token passthrough keeps the minted source-token precision.
14. **Permit execution MUST confirm the owner's token balance before spending the single-use permit** — An EIP-2612 permit is single-use: the token increments the owner's nonce on the first successful `permit()`, so executing against an unfunded owner burns the permit and strands the ramp. `assertOwnerHasBalance` in `squidrouter-permit-execution-handler.ts` reads `balanceOf(owner)` on both the direct-transfer and relayer paths and throws a **recoverable** error when the owner cannot cover `value`, giving the owner ~10 minutes (`getMaxRetries()=20` at the 30s cadence) to fund the wallet. On the direct-transfer path, retries additionally skip `permit()` when the standing allowance already covers `value`, so an already-consumed permit is never replayed.
15. **The SDK pre-checks the source wallet balance before registering any offramp** — `assertSufficientOfframpBalance` (called from `VortexSdk.registerRamp` for every SELL corridor) reads the input token balance of `walletAddress` on the source EVM chain and rejects registration with `InsufficientBalanceError` when it does not cover `inputAmount`. This is client-side defense-in-depth against reverting user transactions / unexecutable permits: it is best-effort (RPC failure or unknown token skips the check, AssetHub sources are not checked) and MUST NOT be relied on in place of invariant 14 or backend-side validation.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Bridge funds stuck in transit** | Dual monitoring (Squid + Axelar scan). Arrival polling is bounded at 80% of the phase processor timeout (8 minutes by default) and stops on processor abort. Phase retries on failure. Gas proactively funded via `addNativeGas`. |
| **Axelar validator confirm poll fails (transfer stuck at "called")** | Auto-recovery: broadcast a fresh `ConfirmGatewayTx` obtained from Axelar's recovery signing service (public tx hash only, no Vortex keys). Cooldown of 10 minutes between attempts, persisted in ramp state. Recovery failures are swallowed; the status loop keeps polling and retries after the cooldown. |
| **Gas overpayment to Axelar** | `calculateGasFeeInUnits()` uses Axelar's reported base fee + estimated gas × source gas price × multiplier. Result verified non-negative. |
| **Double-spend of approve/swap** | Approve hash persisted immediately; on re-entry handler skips to swap if hash exists. EVM nonce prevents on-chain double-spend in any case. |
| **Permit replay** | Each permit has a nonce + deadline; TokenRelayer validates on-chain. |
| **Unfunded owner burns the single-use permit** | User signs the permit before funding the wallet (or drains it after signing); executing `permit()` would consume the nonce with no recoverable transfer. Backend checks `balanceOf(owner) >= value` before touching the permit and retries recoverably (~10 min window); SDK additionally refuses to register an offramp when the wallet balance does not cover `inputAmount`. |
| **Executor key compromise** | Attacker can call `execute()` with their own signatures but cannot steal in-flight user funds — the key only pays gas. Blast radius: gas balance drain. |
| **Squid Router API manipulation (fake "success")** | Balance check runs in parallel; even if Squid reports premature success, tokens must actually arrive. |
| **Squid rate limit (429)** | Exponential backoff retry; other errors fail fast. |
| **Transaction not found during confirmation** | Exponential backoff retry (5s → 10s → 20s → 30s cap), up to 4 attempts. |
| **No-permit fallback hash spoofing** | User reports tx hash → backend calls `waitForTransactionReceipt(hash)` and verifies the receipt `from`, receipt `to`, and transaction calldata against the expected presigned user-wallet transaction. A missing hash or mismatched transaction fails before the phase advances. |
| **No-permit allowance window attack** | The `squidRouterNoPermitApprove` grants Squid an allowance from the user's wallet; if the swap hash never confirms, the allowance lingers. The user wallet, not Vortex, retains the risk. UX should remind the user to revoke unused allowances; backend cannot revoke on the user's behalf. |
| **Skip-Squid trivial-case manipulation** | The skip path triggers only when destination is Base+USDC, validated server-side by the quote engine before any presigned tx is generated. Attacker cannot force the skip path on non-Base/non-USDC routes. |
| **Destination decimal under-scaling** | A quote route bridges from a 6-decimal source token to an 18-decimal destination token (for example Base USDC → BSC USDT), but metadata reconstructs the destination raw output using source decimals. Displayed decimals look correct while raw metadata is under-scaled. | Preserve Squid's `route.estimate.toAmount` directly as destination-token raw metadata, and persist `quote.outputAmount` with destination-token precision before building the final transfer. |

**⚠️ FINDING F-CARRIED**: In `squid-router-phase-handler.ts` line 147, `getPublicClient()` defaults to Moonbeam if `inputCurrency` doesn't match any known case and logs "This is a bug." Same handler also catches errors and silently defaults to Moonbeam (line 151-152). This fallback could cause transactions to be submitted to the wrong network.

## Audit Checklist

- [x] Verify `squidRouterApproveHash` is persisted to state BEFORE the swap transaction is sent. **PASS**
- [x] Verify `Promise.any` correctly races bridge status check vs balance check. **PASS** — `AggregateError` handling confirmed.
- [x] Verify `calculateGasFeeInUnits()` cannot produce negative or astronomically large values. **PASS**
- [x] Verify `addNativeGas` call targets the correct Axelar gas service address (`0x2d5d7d31F671F86C782533cc367F14109a082712`) on the correct chain. **PASS**
- [PARTIAL] Verify `MOONBEAM_FUNDING_PRIVATE_KEY` (gas funding) and `MOONBEAM_EXECUTOR_PRIVATE_KEY` (relayer calls) are distinct keys. **PARTIAL** — distinct env vars, but operationally `MOONBEAM_FUNDING_PRIVATE_KEY` is reused on **Base** for subsidization and the `backupApprove` funding spender. The name no longer reflects its scope; rename to `EVM_FUNDING_PRIVATE_KEY` and expose via a per-network getter (see `06-cross-chain/fund-routing.md`).
- [PARTIAL] `getPublicClient()` Moonbeam fallback (line 147). **PARTIAL** — known buggy fallback; logs "This is a bug" but defaults to Moonbeam.
- [x] `isSignedTypedDataArray` validation in `squidrouter-permit-execution-handler.ts` correct. **PASS**
- [x] **Owner balance guard before permit execution**: `assertOwnerHasBalance` runs on both the direct-transfer and relayer paths before `permit()` / `TokenRelayer.execute()`; insufficient balance raises a recoverable error (retry window via `getMaxRetries()=20`), and the direct-transfer path skips `permit()` when the standing allowance already covers `value`. **PASS**
- [x] **SDK offramp balance pre-flight**: `assertSufficientOfframpBalance` in `packages/sdk/src/preflight.ts` is invoked from `VortexSdk.registerRamp` for every SELL corridor and throws `InsufficientBalanceError` when the source wallet cannot cover `inputAmount`; RPC failures skip permissively. **PASS** — client-side only, backend guards remain authoritative.
- [x] `RELAYER_ADDRESS` matches deployed TokenRelayer on the correct network. **PASS**
- [x] `EVM_BALANCE_CHECK_TIMEOUT_MS` (15 minutes) appropriate for Axelar GMP. **PASS**
- [x] `DEFAULT_SQUIDROUTER_GAS_ESTIMATE` (1,600,000) reasonable upper bound. **PASS**
- [x] `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` cap is enforced. **PASS (FIXED F-001)** — `throw` added.
- [x] `squidRouterPermitExecutionValue` validated before `msg.value`. **PASS (FIXED F-027)**.
- [PARTIAL] `sendTransactionWithBlindRetry` nonce safety. **PARTIAL** — by design.
- [x] **FINDING F-063 (MEDIUM)**: SquidRouter slippage rejection (>2.5%) enforced. **PASS (FIXED)**.
- [x] **No-permit fallback receipt validation**: `waitForUserHash` verifies receipt `from`, receipt `to`, and transaction `input` against the expected user address and presigned EVM transaction payload before advancing.
- [x] **Skip-Squid trivial path**: emits passthrough bridge meta in `BaseSquidRouterEngine` and short-circuits discount/fee engines. Destination address validated by quote engine `validate()`. **PASS** — no security checks bypassed.
- [x] **Destination-token raw output metadata**: `evmToEvm.outputAmountRaw` preserves Squid's `route.estimate.toAmount` in destination raw units, including routed Alfredpay onramps. **PASS** — prevents Base/Polygon 6-decimal source → BSC USDT-style 18-decimal destination under-scaling.
- [x] **Squid 429 rate-limit retry**: exponential backoff. **PASS — verify backoff cap.**
- [x] **Arrival timeout**: `waitUntilTrue` accepts a timeout argument. **PASS** — verify all callers pass a finite value.
- [EXISTING FINDING F-054]: `backupSquidRouterApprove`/`backupSquidRouterSwap`/`backupApprove` presigned txs have no registered phase handler. Either dead code or missing implementation.
