# Squid Router Integration

## What This Does

Squid Router is a cross-chain swap/routing protocol built on Axelar's General Message Passing (GMP). Vortex uses it for:
- **BRL on-ramp**: Base USDC → user's destination EVM chain (any token).
- **BRL off-ramp**: User's source EVM chain → Base USDC.
- **EUR on-ramp (Monerium)**: Polygon EURe → Moonbeam.
- **Off-ramp permit acquisition (Alfredpay)**: User EVM → Moonbeam via `TokenRelayer.execute()` with EIP-2612 permit.

It handles cross-chain swap execution, Axelar bridge status monitoring, and gas subsidization on the destination chain.

**Provider type:** Cross-chain router
**Chains involved:** Base, Polygon, Moonbeam, Ethereum, Arbitrum, BSC, Avalanche, etc. (any EVM destination supported by Squid)
**Phase handlers:**
- `squid-router-phase-handler.ts` — Submits presigned approve + swap transactions on the source EVM chain.
- `squid-router-pay-phase-handler.ts` — Monitors Axelar bridge status, funds Axelar gas, waits for cross-chain settlement (with finite arrival timeout).
- `squidrouter-permit-execution-handler.ts` — Calls `TokenRelayer.execute()` with EIP-2612 permit + payload for off-ramp permit flows. Also handles the no-permit fallback path where the user's wallet submits the substituting transactions directly.

### On-ramp flow (BRL onramp post-Nabla, e.g. Base USDC → user's Polygon ERC-20)

1. After `nablaSwapEvm` + `distributeFeesEvm` on Base.
2. `squidRouterApprove` (Base): approve the Squid router for Base USDC.
3. `squidRouterSwap` (Base): submit Squid swap call.
4. `squidRouterPay`: poll Axelar GMP status + ephemeral balance on destination chain via `Promise.any` race; fund Axelar gas with `addNativeGas`; arrival is bounded by a finite timeout.
5. Optional `backupSquidRouterApprove` / `backupSquidRouterSwap` on the destination chain if the bridged token (axlUSDC / USDC) needs further conversion to the user's requested output token. **F-054: these `backup*` presigned txs have no registered phase handler.**
6. `destinationTransfer` to the user.

### Off-ramp flow (user EVM source → Base USDC)

1. User signs one of three paths (depending on source ERC-20 capabilities and direction):
   - **Permit path**: EIP-2612 permit + payload typed data → `squidRouterPermitExecute` → `TokenRelayer.execute()` pulls funds, approves Squid, calls swap atomically. Gas paid by `MOONBEAM_EXECUTOR_PRIVATE_KEY`.
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
4. **Arrival check MUST have a finite timeout** — `EVM_BALANCE_CHECK_TIMEOUT_MS` (15 minutes) bounds how long a phase waits before erroring; `waitUntilTrue` enforces this.
5. **Squid API rate-limit responses MUST be retried with backoff** — 429 responses are retried with exponential backoff before failing the phase. Other errors propagate directly.
6. **Axelar gas funding MUST use `addNativeGas` on the correct chain** — The funding source/chain is selected based on the route, not from request input.
7. **Permit execution MUST verify both permit and payload signatures** — `squidRouterPermitExecute` extracts v/r/s from both `permitTypedData` and `payloadTypedData`; both must be valid `SignedTypedData`.
8. **`MOONBEAM_EXECUTOR_PRIVATE_KEY` is the relayer caller** — Funds gas only; MUST NOT hold user funds.
9. **No-permit fallback MUST verify on-chain receipt for every reported user hash** — `waitForUserHash` calls `waitForTransactionReceipt`; non-success status throws `RecoverablePhaseError`. The user-reported hash itself is trusted (no signature verification — the receipt confirms it succeeded, which is sufficient because the user controls the source funds either way).
10. **No-permit fallback MUST NOT advance to `fundEphemeral` until BOTH approve and swap (or the direct transfer) have confirmed** — Sequential `waitForUserHash` calls in `executeNoPermitFallback` enforce this.
11. **Transaction hashes MUST be persisted to state before waiting** — `squidRouterApproveHash`, `squidRouterSwapHash`, `squidRouterPayTxHash`, `squidRouterPermitExecutionHash`, `squidRouterNoPermitApproveHash`, `squidRouterNoPermitSwapHash`, `squidRouterNoPermitTransferHash` all enable crash recovery.
12. **Skip-Squid path MUST NOT lose destination validation** — Quote engine `validate()` runs regardless of `skipRouteCalculation`; `destinationTransfer` is the only on-chain step that fires.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Bridge funds stuck in transit** | Dual monitoring (Squid + Axelar scan). 15-minute arrival timeout. Phase retries on failure. Gas proactively funded via `addNativeGas`. |
| **Gas overpayment to Axelar** | `calculateGasFeeInUnits()` uses Axelar's reported base fee + estimated gas × source gas price × multiplier. Result verified non-negative. |
| **Double-spend of approve/swap** | Approve hash persisted immediately; on re-entry handler skips to swap if hash exists. EVM nonce prevents on-chain double-spend in any case. |
| **Permit replay** | Each permit has a nonce + deadline; TokenRelayer validates on-chain. |
| **Executor key compromise** | Attacker can call `execute()` with their own signatures but cannot steal in-flight user funds — the key only pays gas. Blast radius: gas balance drain. |
| **Squid Router API manipulation (fake "success")** | Balance check runs in parallel; even if Squid reports premature success, tokens must actually arrive. |
| **Squid rate limit (429)** | Exponential backoff retry; other errors fail fast. |
| **Transaction not found during confirmation** | Exponential backoff retry (5s → 10s → 20s → 30s cap), up to 4 attempts. |
| **No-permit fallback hash spoofing** | User reports tx hash → backend calls `waitForTransactionReceipt(hash)`. Hash is verified against actual chain state, not trusted blindly. The worst the user can do is report a hash that doesn't exist (handler errors recoverably) or a hash for a different transaction (receipt's `to`/`value` are not currently re-checked — see open question below). |
| **No-permit allowance window attack** | The `squidRouterNoPermitApprove` grants Squid an allowance from the user's wallet; if the swap hash never confirms, the allowance lingers. The user wallet, not Vortex, retains the risk. UX should remind the user to revoke unused allowances; backend cannot revoke on the user's behalf. |
| **Skip-Squid trivial-case manipulation** | The skip path triggers only when destination is Base+USDC, validated server-side by the quote engine before any presigned tx is generated. Attacker cannot force the skip path on non-Base/non-USDC routes. |

**⚠️ FINDING F-CARRIED**: In `squid-router-phase-handler.ts` line 147, `getPublicClient()` defaults to Moonbeam if `inputCurrency` doesn't match any known case and logs "This is a bug." Same handler also catches errors and silently defaults to Moonbeam (line 151-152). This fallback could cause transactions to be submitted to the wrong network.

## Audit Checklist

- [x] Verify `squidRouterApproveHash` is persisted to state BEFORE the swap transaction is sent. **PASS**
- [x] Verify `Promise.any` correctly races bridge status check vs balance check. **PASS** — `AggregateError` handling confirmed.
- [x] Verify `calculateGasFeeInUnits()` cannot produce negative or astronomically large values. **PASS**
- [x] Verify `addNativeGas` call targets the correct Axelar gas service address (`0x2d5d7d31F671F86C782533cc367F14109a082712`) on the correct chain. **PASS**
- [PARTIAL] Verify `MOONBEAM_FUNDING_PRIVATE_KEY` (gas funding) and `MOONBEAM_EXECUTOR_PRIVATE_KEY` (relayer calls) are distinct keys. **PARTIAL** — distinct env vars, but operationally `MOONBEAM_FUNDING_PRIVATE_KEY` is reused on **Base** for subsidization and the `backupApprove` funding spender. The name no longer reflects its scope; rename to `EVM_FUNDING_PRIVATE_KEY` and expose via a per-network getter (see `06-cross-chain/fund-routing.md`).
- [PARTIAL] `getPublicClient()` Moonbeam fallback (line 147). **PARTIAL** — known buggy fallback; logs "This is a bug" but defaults to Moonbeam.
- [x] `isSignedTypedDataArray` validation in `squidrouter-permit-execution-handler.ts` correct. **PASS**
- [x] `RELAYER_ADDRESS` matches deployed TokenRelayer on the correct network. **PASS**
- [x] `EVM_BALANCE_CHECK_TIMEOUT_MS` (15 minutes) appropriate for Axelar GMP. **PASS**
- [x] `DEFAULT_SQUIDROUTER_GAS_ESTIMATE` (1,600,000) reasonable upper bound. **PASS**
- [x] `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` cap is enforced. **PASS (FIXED F-001)** — `throw` added.
- [x] `squidRouterPermitExecutionValue` validated before `msg.value`. **PASS (FIXED F-027)**.
- [PARTIAL] `sendTransactionWithBlindRetry` nonce safety. **PARTIAL** — by design.
- [x] **FINDING F-063 (MEDIUM)**: SquidRouter slippage rejection (>2.5%) enforced. **PASS (FIXED)**.
- [OPEN] **No-permit fallback receipt validation**: `waitForUserHash` confirms `receipt.status === "success"` only. Does NOT validate that `receipt.to`, `receipt.from`, decoded calldata, or transferred value match expected Squid call parameters. Should be hardened to decode and assert against expected per-phase parameters.
- [x] **Skip-Squid trivial path**: emits passthrough bridge meta in `BaseSquidRouterEngine` and short-circuits discount/fee engines. Destination address validated by quote engine `validate()`. **PASS** — no security checks bypassed.
- [x] **Squid 429 rate-limit retry**: exponential backoff. **PASS — verify backoff cap.**
- [x] **Arrival timeout**: `waitUntilTrue` accepts a timeout argument. **PASS** — verify all callers pass a finite value.
- [EXISTING FINDING F-054]: `backupSquidRouterApprove`/`backupSquidRouterSwap`/`backupApprove` presigned txs have no registered phase handler. Either dead code or missing implementation.
