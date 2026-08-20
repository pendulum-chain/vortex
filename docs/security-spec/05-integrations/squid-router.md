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
**Chains involved:** Base, Polygon, Ethereum, Arbitrum, BSC, Avalanche, and other enabled EVM destinations supported by Squid. Moonbeam identifiers may remain in historical records, but direct-to/from-Moonbeam ramps are runtime-disabled.
**Block executors:**
- `phases/blocks/phases/squid-router-swap/execution.ts` — Submits presigned approve + swap transactions on the source EVM chain.
- The same `phases/blocks/phases/squid-router-swap/execution.ts` module owns `squidRouterPay`: abort-aware Axelar status/arrival monitoring, gas payment, stuck-confirm recovery, deduplicated supplemental gas, and stuck alerts. Monitoring never marks the phase successful without executed status or destination arrival.
- `phases/blocks/phases/alfredpay-offramp/execution.ts` — Calls `TokenRelayer.execute()` with EIP-2612 permit + payload for Alfredpay off-ramp flows and handles no-permit user transactions.

### On-ramp flow (BRL onramp post-Nabla, e.g. Base USDC → user's Polygon ERC-20)

1. After `nablaSwap` + `distributeFees` on Base.
2. `squidRouterApprove` (Base): approve the Squid router for Base USDC.
3. `squidRouterSwap` (Base): submit Squid swap call.
4. `squidRouterPay`: poll Axelar GMP status + ephemeral balance on destination chain via `Promise.any` race; fund Axelar gas with `addNativeGas`; arrival is bounded by a finite timeout.
5. Optional `backupSquidRouterApprove` / `backupSquidRouterSwap` on the destination chain if the bridged token (axlUSDC / USDC) needs further conversion to the user's requested output token. **F-054: these `backup*` presigned txs have no registered phase handler.**
6. `destinationTransfer` to the user.

For BRL or EUR onramps to a different token on Base after the Nabla output is USDC, the route is a same-chain swap rather than a bridge: `squidRouterApprove` → `squidRouterSwap` → `destinationTransfer`. The static block expands only to `squidRouterSwap`; it does not register `squidRouterPay`, prepare destination backup transactions, or run `finalSettlementSubsidy`. Transaction preparation selects the Base source builder, and the transfer uses the next nonce after the swap. Base USDC omits Squid entirely; EUR→Base EURC and BRL→Base BRLA are separate direct bypasses.

For quote metadata, Squid's `route.estimate.toAmount` is already denominated in the **destination token's raw units**. The bridge metadata (`evmToEvm.outputAmountRaw`, `moonbeamToEvm.outputAmountRaw`, etc.) MUST preserve that raw value directly instead of rebuilding it from the human-readable decimal amount with source-token decimals. This matters for routes like Base USDC (6 decimals) → BSC USDT (18 decimals), where using the source decimals would under-scale the metadata by 12 decimal places. The same invariant applies to routed Alfredpay onramps: even when the Squid source is the Polygon-minted Alfredpay token, `route.estimate.toAmount` remains authoritative for the destination token's raw units and `quote.outputAmount` must retain destination-token precision.

### Off-ramp flow (user EVM source → Base USDC)

For BRL and EUR, `BrlOfframpBase` and `EurOfframpBase` share the EVM source block: Base USDC skips Squid and issues one direct ERC-20 transfer blueprint; a different Base token requests a same-chain Squid route; another EVM source requests a cross-chain route to Base USDC. These are user-wallet transactions, never ephemeral presigns. The block `FundEphemeralExecutor` binds each reported hash to the issued signer, target, calldata, and value before any platform gas or subsidy is spent.

1. User signs one of four paths (depending on source-token capabilities and direction):
   - **Permit path**: EIP-2612 permit + payload typed data → `squidRouterPermitExecute` → source-chain `TokenRelayer.execute()` pulls funds, approves Squid, calls swap atomically. Gas is paid by the configured executor key through a wallet client for `fromNetwork`.
   - **No-permit fallback** (`isNoPermitFallback=true`): user's own wallet broadcasts `squidRouterNoPermitApprove` + `squidRouterNoPermitSwap` (or `squidRouterNoPermitTransferHash` for direct-transfer subcase). Frontend reports the resulting tx hashes back via `UpdateRampRequest.additionalData`. Backend awaits receipts via `waitForUserHash`. **No presigned-tx validation runs for these phases** — they are user-submitted (see `transaction-validation.md`).
   - **Direct transfer** (`isDirectTransfer=true`): same-chain same-token, user wallet submits a direct ERC-20 transfer to the Base ephemeral.
   - **Native-token path**: user's wallet broadcasts only the Squid swap with the native amount in `msg.value`; no ERC-20 approval transaction exists, and the swap uses nonce zero.
2. `squidRouterPay`: monitors Axelar GMP for arrival on Base.
3. Continues with offramp Nabla swap on Base.

### Skip-Squid trivial path

When the BRL on-ramp's destination is **Base + USDC**, the Nabla swap output is already the requested output token. The block flow omits Squid transaction phases and emits only `destinationTransfer` after the prior Base phases. `simulateSquidRouterPassthrough` in `phases/blocks/phases/squid-router-swap/simulation.ts` emits 1:1 metadata with `networkFeeUSD = "0"` for flows that retain an explicit passthrough block, avoiding a Squid request that would fail with "same token same chain". Direct flows preserve a zero network fee without adding the Squid block.

**No security checks are bypassed by this path** — flow resolution and destination transaction preparation still validate the configured destination; the only thing skipped is the Squid HTTP call and its execution phases.

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
12. **Skip-Squid path MUST NOT lose destination validation** — The block catalog only selects the direct flow for its exact same-chain corridor, and `destinationTransfer` remains the final on-chain step.
13. **Squid output raw metadata MUST use destination-token raw units** — `route.estimate.toAmount` is the authoritative destination raw output; `evmToEvm.outputAmountRaw` MUST NOT be recomputed with the source token's decimals. For same-chain same-token passthrough, `inputAmountRaw` is also the destination raw amount and is safe to mirror. Routed Alfredpay onramps follow the same rule; only direct Polygon same-token passthrough keeps the minted source-token precision.
14. **Permit execution MUST confirm the owner's token balance before spending the single-use permit** — An EIP-2612 permit is single-use. `assertOwnerHasBalance` in `phases/blocks/phases/alfredpay-offramp/execution.ts` checks both direct-transfer and relayer paths and throws a recoverable error when the owner cannot cover `value`. Retries skip `permit()` when standing allowance already covers `value`.
15. **The SDK pre-checks the source wallet balance by default, with an explicit deferred-funding mode** — In the default `offrampFundingMode: "prefunded"`, `assertSufficientOfframpBalance` runs from `VortexSdk.registerRamp` for every SELL corridor, reads the input token balance of `walletAddress` on the source EVM chain, and rejects registration with `InsufficientBalanceError` when it does not cover `inputAmount`. Server integrations that intentionally register before funding a temporary wallet MAY configure `offrampFundingMode: "deferred"`; they MUST fund that exact wallet before submitting user transactions and starting the ramp within the registration window. The SDK guard remains client-side defense-in-depth: RPC failure or unknown token skips it, AssetHub sources are not checked, and deferred mode intentionally omits it. It MUST NOT be relied on in place of invariant 14 or backend-side validation.
16. **Same-chain source builders and nonce topology MUST match the source network** — Base-internal BRL and EUR routes MUST use `createOnrampSquidrouterTransactionsFromBaseToEvm`, while Polygon-internal Alfredpay routes use the Polygon builder. Same-chain routes MUST omit bridge-pay and backup transactions, and `destinationTransfer` MUST be the first nonce after `squidRouterSwap`.
17. **Native-token offramps MUST NOT generate or await an ERC-20 approval** — Route construction emits only the Squid swap at nonce zero for native input. User-hash verification requires an approval only when an approval blueprint exists; the swap hash remains mandatory.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Bridge funds stuck in transit** | Dual monitoring (Squid + Axelar scan). Arrival polling is bounded at 80% of the phase processor timeout (8 minutes by default) and stops on processor abort. Phase retries on failure. Gas proactively funded via `addNativeGas`. Past the 20-minute stuck threshold the handler classifies the GMP, attempts the safe recovery for that state, and alerts ops with an actionability classification (see phase-handler description). |
| **Axelar validator confirm poll fails (transfer stuck at "called")** | Auto-recovery: broadcast a fresh `ConfirmGatewayTx` obtained from Axelar's recovery signing service (public tx hash only, no Vortex keys). Cooldown of 10 minutes between attempts, persisted in ramp state. Recovery failures are swallowed; the status loop keeps polling and retries after the cooldown. Past the stuck threshold the same recovery is also attempted for transfers lingering in "called"/"confirming" without `confirm_failed` (axelarscan does not always flag a stalled poll). |
| **Insufficient Axelar gas after payment** | Stuck monitor sends at most one supplemental `addNativeGas` top-up: the `"pending"` sentinel on `squidRouterExtraGasTxHash` is claimed atomically (conditional UPDATE requiring the marker to still be absent) before the broadcast and reconciled to the tx hash after, so neither a crash nor a concurrent execution can re-pay. Aborted executions take no recovery actions. Skipped in the iteration that made the initial payment (the fetched status predates it). Excess gas is refunded to the funding wallet by the gas service. |
| **Gas overpayment to Axelar** | `calculateGasFeeInUnits()` uses Axelar's reported base fee + estimated gas × source gas price × multiplier. Result verified non-negative. |
| **Double-spend of approve/swap** | Approve hash persisted immediately; on re-entry handler skips to swap if hash exists. EVM nonce prevents on-chain double-spend in any case. |
| **Permit replay** | Each permit has a nonce + deadline; TokenRelayer validates on-chain. |
| **Unfunded owner burns the single-use permit** | User signs the permit before funding the wallet (or drains it after signing); executing `permit()` would consume the nonce with no recoverable transfer. Backend checks `balanceOf(owner) >= value` before touching the permit and retries recoverably (~10 min window). The SDK additionally refuses registration by default; deferred-funding integrations accept responsibility for funding before transaction submission and start. |
| **Executor key compromise** | Attacker can call `execute()` with their own signatures but cannot steal in-flight user funds — the key only pays gas. Blast radius: gas balance drain. |
| **Squid Router API manipulation (fake "success")** | Balance check runs in parallel; even if Squid reports premature success, tokens must actually arrive. |
| **Squid rate limit (429)** | Exponential backoff retry; other errors fail fast. |
| **Transaction not found during confirmation** | Exponential backoff retry (5s → 10s → 20s → 30s cap), up to 4 attempts. |
| **No-permit fallback hash spoofing** | User reports tx hash → backend calls `waitForTransactionReceipt(hash)` and verifies the receipt `from`, receipt `to`, and transaction calldata against the expected presigned user-wallet transaction. A missing hash or mismatched transaction fails before the phase advances. |
| **No-permit allowance window attack** | The `squidRouterNoPermitApprove` grants Squid an allowance from the user's wallet; if the swap hash never confirms, the allowance lingers. The user wallet, not Vortex, retains the risk. UX should remind the user to revoke unused allowances; backend cannot revoke on the user's behalf. |
| **Skip-Squid trivial-case manipulation** | The catalog selects the direct flow only for its exact same-chain token corridor before any transaction is generated. An attacker cannot force the direct flow for a routed destination. |
| **Destination decimal under-scaling** | A quote route bridges from a 6-decimal source token to an 18-decimal destination token (for example Base USDC → BSC USDT), but metadata reconstructs the destination raw output using source decimals. Displayed decimals look correct while raw metadata is under-scaled. | Preserve Squid's `route.estimate.toAmount` directly as destination-token raw metadata, and persist `quote.outputAmount` with destination-token precision before building the final transfer. |

The removed input-currency-to-RPC fallback no longer exists. The block executor uses phase-owned `fromNetwork` metadata for source submission.

## Audit Checklist

- [x] Verify `squidRouterApproveHash` is persisted to state BEFORE the swap transaction is sent. **PASS**
- [x] Verify `Promise.any` correctly races bridge status check vs balance check. **PASS** — `AggregateError` handling confirmed.
- [x] Verify `calculateGasFeeInUnits()` cannot produce negative or astronomically large values. **PASS**
- [x] Verify `addNativeGas` call targets the correct Axelar gas service address (`0x2d5d7d31F671F86C782533cc367F14109a082712`) on the correct chain. **PASS**
- [ ] Verify `MOONBEAM_FUNDING_PRIVATE_KEY` (gas funding) and `MOONBEAM_EXECUTOR_PRIVATE_KEY` (relayer calls) are distinct keys. **PARTIAL** — distinct env vars, but operationally `MOONBEAM_FUNDING_PRIVATE_KEY` is reused on **Base** for subsidization and the `backupApprove` funding spender. The name no longer reflects its scope; rename to `EVM_FUNDING_PRIVATE_KEY` and expose via a per-network getter (see `06-cross-chain/fund-routing.md`).
- [x] Source RPC selection uses phase-owned `fromNetwork`; there is no Moonbeam fallback. **PASS** — `phases/blocks/phases/squid-router-swap/execution.ts`.
- [x] `isSignedTypedDataArray` validation in `phases/blocks/phases/alfredpay-offramp/execution.ts` is correct. **PASS**
- [x] **Owner balance guard before permit execution**: `assertOwnerHasBalance` runs on both the direct-transfer and relayer paths before `permit()` / `TokenRelayer.execute()`; insufficient balance raises a recoverable error (retry window via `getMaxRetries()=20`), and the direct-transfer path skips `permit()` when the standing allowance already covers `value`. **PASS**
- [x] **SDK offramp balance pre-flight**: `assertSufficientOfframpBalance` in `packages/sdk/src/preflight.ts` is invoked from `VortexSdk.registerRamp` for every SELL corridor in the default `"prefunded"` mode and throws `InsufficientBalanceError` when the source wallet cannot cover `inputAmount`; RPC failures skip permissively. `"deferred"` mode intentionally omits the registration check for register-then-fund integrations. **PASS** — regression tests cover the default rejection and deferred registration; client-side only, backend guards remain authoritative.
- [x] `RELAYER_ADDRESS` matches deployed TokenRelayer on the correct network. **PASS**
- [x] `EVM_BALANCE_CHECK_TIMEOUT_MS` (15 minutes) appropriate for Axelar GMP. **PASS**
- [x] `DEFAULT_SQUIDROUTER_GAS_ESTIMATE` (1,600,000) reasonable upper bound. **PASS**
- [x] `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` cap is enforced. **PASS (FIXED F-001)** — `throw` added.
- [x] `squidRouterPermitExecutionValue` validated before `msg.value`. **PASS (FIXED F-027)**.
- [ ] `sendTransactionWithBlindRetry` nonce safety. **PARTIAL** — by design.
- [x] **FINDING F-063 (MEDIUM)**: SquidRouter slippage rejection (>2.5%) enforced. **PASS (FIXED)**.
- [x] **No-permit fallback receipt validation**: `waitForUserHash` verifies receipt `from`, receipt `to`, and transaction `input` against the expected user address and presigned EVM transaction payload before advancing.
- [x] **Skip-Squid trivial path**: the block catalog selects the direct flow for exact same-chain corridors; direct quote simulation preserves zero network fee and transaction preparation omits Squid phases. **PASS** — no security checks bypassed.
- [x] **Destination-token raw output metadata**: `evmToEvm.outputAmountRaw` preserves Squid's `route.estimate.toAmount` in destination raw units, including routed Alfredpay onramps. **PASS** — prevents Base/Polygon 6-decimal source → BSC USDT-style 18-decimal destination under-scaling.
- [x] **Squid 429 rate-limit retry**: exponential backoff. **PASS — verify backoff cap.**
- [x] **Arrival timeout**: `waitUntilTrue` accepts a timeout argument. **PASS** — verify all callers pass a finite value.
- [EXISTING FINDING F-054]: `backupSquidRouterApprove`/`backupSquidRouterSwap`/`backupApprove` presigned txs have no registered phase handler. Either dead code or missing implementation.
