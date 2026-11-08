# Relay

## What This Does

Relay is the bridge between Base and Robinhood Chain (4663) on the stock token corridor. Vortex asks its API for an
order, checks the order against the ramp, and lets the ramp's ephemeral pay it. Relay's solver then pays the output to
the same ephemeral on the other chain. Relay only ever holds what the ramp deposits for its order, and no Relay-supplied
transaction is signed before it passes the validators in `packages/shared/src/services/relay/validation.ts`.

**Provider type:** Cross-chain bridge (not a fiat anchor)
**Fiat currencies:** None directly. It serves the BRL/Pix stock flows, `BrlOnrampRobinhoodStock` and `BrlOfframpRobinhoodStock`.
**Chains involved:** Base (native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) and Robinhood Chain (USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`)
**Phase handlers:** `phases/blocks/phases/stock-route/execution.ts` (`RelayBridgeExecutor`, phase `relayBridge`)
**API auth method:** `x-api-key` header from `RELAY_API_KEY`, which Relay requires on every quote. The API refuses to start with a stock direction enabled and no key.
**Endpoints consumed:** `POST /quote/v2` and `GET /intents/status/v3`, in `packages/shared/src/services/relay/relayApi.ts`

### Pinned addresses

| Pin | Address | Used for |
|---|---|---|
| Depository (both chains) | `0x4cd00e387622c35bddb9b4c962c136462338bc31` | Spender and target of the buy deposit |
| Order signer | `0xf70da97812cb96acdf810712aa562db8dfa3dbef` | Must have signed a strict sell order |

### Buy: calldata deposit (Base USDC to USDG)

1. **Quote.** `simulateStockRouteBuy` takes an `EXACT_INPUT` quote with a placeholder user, and swaps its output less a
   drift margin of 2 bps, at least 0.003 USDG. That reduced amount is `Y`, the exact USDG the ramp needs. The floor covers
   the fixed part of an `EXACT_OUTPUT` order's cost, about 0.0013 USDG, so a small buy's order still fits its quote.
2. **Registration.** `prepareStockRouteBuyTxs` asks for an `EXACT_OUTPUT` order of `Y` with `user`, `recipient` and
   `refundTo` all set to the ephemeral. `validateRelayCalldataDeposit` returns the `approve` and `depositErc20`
   transactions that become the presigned `relayApprove` and `relayBridge`.
3. **Execution.** `RelayBridgeExecutor` broadcasts both on Base, then waits for arrival. The order takes `X'`, at most the
   quoted `X`; the remainder is swept by the Nabla block's `baseCleanupUsdc`.

### Sell: strict one-time deposit address (USDG to Base USDC)

1. **Quote.** `simulateStockRouteSell` takes a strict `EXACT_INPUT` quote for the full swap output.
2. **Registration.** `prepareStockRouteSellTxs` orders `M`, the Uniswap swap's hard minimum, with `useDepositAddress`,
   `strict`, 50 bps slippage, and `user`, `recipient` and `refundTo` all set to the ephemeral. The returned deposit address
   becomes the recipient of the presigned `uniswapSwap`, so no Relay transaction exists: the swap is the deposit.
3. **Execution.** `RelayBridgeExecutor` only waits for arrival on Base.

`M` is the swap's hard minimum, so a swap that does not revert always deposits at least the order amount. Relay documents
that a strict `EXACT_INPUT` overpayment is filled in full. That is unverified with real funds; see RISK-029.

### Status handling

| Relay status | `relayBridge` behaviour |
|---|---|
| `waiting`, `depositing`, `pending`, `submitted`, `unknown` | Keeps polling every 10 seconds |
| `failure` without `refundFailReason` | Keeps polling, because it can still return to `pending` or move to `refund` |
| `failure` with `refundFailReason` | Reconciliation: Relay could not refund |
| `refund` | Reconciliation: the funds are back on the ephemeral on the origin chain |
| `success` | Moves on once the destination balance is sufficient |
| Status API unavailable | Moves on only if the destination balance is already sufficient, and logs `RELAY_ARRIVAL_BALANCE_FALLBACK` (RISK-030) |

A poll is bounded at `getSquidRouterPayTimeoutMs()`, 80% of the phase timeout, and ends in a recoverable error so that the
phase re-enters. There is no terminal timeout: funds are on the ephemeral or with Relay, so the ramp never fails here.

## Security Invariants

1. **Credentials MUST stay server-side and env-only.** `RELAY_API_KEY` and `RELAY_API_BASE_URL` are read at call time and are not exported as constants, so they cannot reach a client bundle. Rotation follows `07-operations/secret-management.md` and RISK-011.
2. **Order amounts MUST derive from the persisted quote.** The buy order is for exactly `bridge.outputAmountRaw` and may take at most `bridge.inputAmountRaw`. The sell order is for exactly `swap.hardMinimumOutputRaw`, and it must guarantee at least the quoted USDC scaled to that amount, less 1%. Nothing comes from client input.
3. **Raw units MUST keep their token's decimals.** `bridge.inputAmountRaw` and `bridge.outputAmountRaw` are in the input and output token's own raw units, and USDC and USDG are both 6-decimal. A stock amount (18 decimals) never enters an order.
4. **Every provider response MUST be schema-validated.** `relayQuoteSchema` and `relayIntentStatusSchema` parse the consumed fields. At registration a contract violation is a hard error. In `relayBridge` a malformed status counts as an unavailable status.
5. **An order MUST pass its validator before any of its data is signed or stored.** Quotes taken at quote time use a placeholder user and only supply a price. Both validators require a recomputed `orderId` equal to the returned one (the EVM path of the settlement SDK's `getOrderId`, pinned against real quotes), the pinned depository, one input and one output payment, the origin and destination tokens and chains, no destination calls, no order fees, an ephemeral output recipient, ephemeral refund recipients with the first refund on the origin chain, and a deadline at or after the required minimum.
   - **Calldata deposit:** exactly `approve` then `deposit`, from the ephemeral, with zero value. Calldata is compared byte for byte with a local encoding of `approve(depository, X')` on USDC and `depositErc20(ephemeral, USDC, X', orderId)` on the depository. `gas`, `maxFeePerGas` and a sane `maxPriorityFeePerGas` must be present, because the signer otherwise falls back to a 187.5 gwei default.
   - **Strict deposit:** exactly one `deposit` step, a `transfer` of USDG for exactly `M`. The address must be a valid EVM address and not the ephemeral, the depository, the swap router, the USDG contract or the zero address. `orderSignature` must recover to the pinned order signer.
6. **A moved price MUST NOT reach a signature.** An order that costs more than the quote committed to (`RELAY_INPUT_ABOVE_QUOTE`), or a sell order guaranteeing less than the floor, is rejected at registration with a public 503 asking for a new quote, as is an unreachable Relay API. Any other validator failure stays a hard error. On a buy the Pix ticket already exists by then, but its code never reaches a client, because registration fails.
7. **Provider fees MUST be pre-accounted.** Relay's fees are inside the quoted output, so the amount promised to the customer already reflects them. `bridge.costUsd` is an estimate reported in `providerCosts` with `includedIn: "rate"`, and no deduction depends on it.
8. **Broadcasts MUST be journalled and never repeated on ambiguity.** `relayApprove` and `relayBridge` run through `runFinancialOperation` with classes `relay-approve` and `relay-deposit`, and a stable request holding the signed transaction. The hash is deterministic, so an ambiguous attempt reconciles by receipt. Presigned transactions are re-validated against their blueprints before broadcast, and a mismatch pauses for reconciliation.
9. **The deposit MUST NOT be broadcast before its input has settled.** The USDC balance of the ephemeral must cover `X'` before both `relayApprove` and `relayBridge`, because a reverted deposit burns its nonce and leaves only operator recovery.
10. **Arrival MUST be proven on the destination chain.** The ephemeral's destination token balance must reach `bridge.outputAmountRaw` on a buy, or the order's guaranteed minimum on a sell, before the phase completes. `success` alone is not enough. There is no baseline, because whatever satisfies this check is spendable by the ramp. A sell shortfall against the quote is left to `SubsidizePre`, which enforces its own cap.
11. **Without a status, arrival MUST be evidenced by balance and logged.** This is the only completion path that does not rest on a Relay status. It is accepted under RISK-030.
12. **Provider errors MUST NOT fail the ramp.** Transport failures, HTTP errors and malformed responses are recoverable in `relayBridge`. Refunds, failed refunds, unresolved metadata, mined reverts and journal verdicts pause for reconciliation.
13. **Abort signals MUST propagate.** A caller's abort reaches `fetch` and the poll's sleep, and is not reported as a Relay failure. Every Relay request also has a finite 15-second timeout.
14. **Fund recovery MUST exist for every refund path.** A buy refund returns USDC to the ephemeral on Base, covered by `baseCleanupUsdc`. A sell refund returns USDG to the ephemeral on Robinhood Chain, covered by `relayBackupApprove`. Both are operator actions, not automated, and `relayBackupApprove` is not prefunded, so it relies on what is left of the ephemeral's gas budget.
15. **The status response MUST be read defensively.** `"N/A"` fail reasons count as absent, and `unknown` is a status rather than an error, as Relay's live API returns both.
16. **Order deadlines MUST outlast the ramp's execution window.** Relay exposes no quote validity to propagate, so the Vortex quote keeps its own expiry and registration takes a new order. A buy order must live at least 4 days, past the 3 days a paid ramp can still be recovered. A sell order must live at least until the swap's deadline.

### Webhooks and idempotency

Vortex has no Relay webhook: state comes from polling and from on-chain reads. `POST /quote/v2` has no side effects, and Relay offers no idempotency key for it. The deposit's idempotency comes from the presigned transaction's nonce and from the one-time order: a repeated deposit to a strict address is refunded as `DOUBLE_SPEND`, according to Relay's docs.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **API credential compromise** | An attacker gets `RELAY_API_KEY` | It only spends rate-limit budget. Every order is validated before use, so the key confers no authority over funds. Rotate through the deployment environment. |
| **Manipulated calldata** | A compromised API or a tampered `RELAY_API_BASE_URL` returns a deposit to another address or for another amount | Byte-for-byte comparison with a local encoding, the pinned depository and token, the recomputed `orderId`, and no call value. The deposit's `id` is the hash of an order that must pay the ephemeral. |
| **Substituted strict deposit address** | A compromised API passes on a genuine signed order and replaces only the deposit address | **Not preventable offline.** `orderSignature` proves that Relay signed the order, not that the address belongs to it. A forged order fails the signature check, and known wrong addresses are rejected, but this substitution passes every check and diverts that sell's swap output. The ramp then pauses at `relayBridge` before any payout. Accepted under RISK-027. |
| **Manipulated amounts** | Relay returns a poor order minimum, or one that costs more than quoted | Buy: `X' <= X`, and the minimum must equal `Y`. Sell: the minimum must meet the floor. Arrival is checked against those amounts. |
| **Provider unavailability** | The API is down at quote, registration or execution | Quote: no quote is issued. Registration: public 503. Execution: polling continues, and a sufficient balance completes the phase under RISK-030. |
| **Stuck or late fill** | The solver never fills, or fills after the poll has ended | The ramp keeps re-entering and waits on the ephemeral's balance, so a late fill is still seen. Fees distributed earlier stay final under RISK-010. This behaviour has test coverage only, tracked under RISK-029. |
| **Refund to the wrong party** | An order pays refunds elsewhere | Every refund recipient must be the ephemeral. |
| **Destination call injection** | An order includes destination calls | `output.calls` must be empty. |
| **Provider rate limit** | Quote traffic exceeds Relay's budget | Relay's budget belongs to the API key and is shared by every caller, so stock quotes are limited per IP (`STOCKS_QUOTE_RATE_LIMIT_PER_MINUTE`, default 20). A `429` at quote time produces no quote, and a `429` at registration returns the public 503. A status `429` counts as an unavailable status. |
| **TLS downgrade** | MITM on the API connection | HTTPS base URL by default. The validators limit a tampered response, with the strict deposit address as the residual risk above. |

## Audit Checklist

- [x] Credentials are loaded from environment variables, and no provider secret appears in logs or errors
- [x] Order amounts derive from the stored quote and not from client input
- [x] Responses are schema-validated, and both validators have adversarial tests that assert each named check
- [x] `orderId` recomputation is pinned against real saved quotes (`packages/shared/src/services/relay/__fixtures__/saved-quotes.json`)
- [x] The provider's fee is pre-accounted in the quoted output
- [x] Transient failures in `relayBridge` are recoverable, and refunds pause for reconciliation
- [x] HTTPS is the default base URL, and requests have a finite timeout
- [x] `relay-approve` and `relay-deposit` are journalled, with tests for re-entry and for a crash with and without a receipt
- [x] The Relay status matrix, arrival evidence and the balance fallback have executor tests
- [x] The fake provider covers these paths in BUY and SELL corridor scenarios
- [ ] Strict deposit address ownership: not verifiable offline, accepted under RISK-027
- [ ] Late fills, refunds, overpayment scaling and the operator recovery approvals: not exercised with real funds, tracked under RISK-029
- [ ] Live shape of `POST /quote/v2` and `GET /intents/status/v3`: covered by `apps/api/src/tests/contracts/relay.contract.test.ts` behind `RUN_LIVE_TESTS`, not a PR-blocking check. It sends the stock route's exact quote and order requests, which a hermetic test pins against the production code, and a refused request other than `401`, `403` or `429` fails it
- [ ] Production `RELAY_API_KEY` on Relay's elevated quote budget: Relay's default of 50 quotes per minute is below what a few IPs may request under the per-IP limit; deployment-dependent
- [ ] `CONTRACT_RELAY_API_KEY` for the nightly contract job: deployment-dependent; the job runs unkeyed without it
