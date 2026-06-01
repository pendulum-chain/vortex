# Mykobo Integration

## What This Does

Mykobo is the EUR fiat anchor used by Vortex for EUR on/off-ramp operations on **Base (Ethereum L2)**. Mykobo settles SEPA bank transfers into / out of EURC (Circle's EUR stablecoin, ERC-20) on Base. There is no Stellar, Pendulum, or Moonbeam involvement for EUR liquidity: all EUR flow now happens on Base, mirroring the BRLA-on-Base architecture.

Mykobo replaces two earlier EUR rails:

- The **Stellar SEP-24 EUR off-ramp** (Mykobo anchor reached via Spacewalk) — removed for EUR. See `stellar-anchors.md` for the deprecation note.
- The **Monerium EUR on-ramp** (Monerium EURe minted on Moonbeam) — removed. See `monerium.md` for the deprecation note.

**Provider type:** Both (on-ramp and off-ramp)
**Fiat currency:** EUR (Euro, SEPA)
**Chain involved:** Base (EURC is an ERC-20 on Base; USDC on Base is the Nabla swap counter-asset)
**Phase handlers:**
- `mykobo-onramp-deposit-handler.ts` — On-ramp: After the user's SEPA transfer is received, Mykobo settles EURC on Base to the user's Base ephemeral; the handler polls the Base RPC until the expected balance arrives.
- `mykobo-payout-handler.ts` — Off-ramp: Sends a presigned ERC-20 EURC transfer from the Base ephemeral to the Mykobo-controlled `receivables` address, then polls Mykobo's transaction status until `COMPLETED`.

**API surface:** Mykobo HTTP API client `MykoboApiService` (`packages/shared/src/services/mykobo/mykoboApiService.ts`). Singleton.
**API auth method:** Access key + secret key exchanged for a short-lived bearer token via `POST /auth/token`; refresh token via `POST /auth/refresh`. Cached in-process; re-acquired on `401`. Credentials sourced from `MYKOBO_ACCESS_KEY`, `MYKOBO_SECRET_KEY`, `MYKOBO_BASE_URL`, `MYKOBO_CLIENT_DOMAIN` env vars.

**`MYKOBO_CLIENT_DOMAIN` operational note:** The client domain is sent as `client_domain` on every Mykobo API call (`MykoboApiService`). It identifies the Vortex deployment to Mykobo and determines the **fee tier** applied to that deployment's intents. When unset, Mykobo falls back to its default tier (observed: ~0.31 EUR fixed deposit fee vs. ~0.06 EUR for the negotiated Vortex tier on `satoshipay.io`). Because the constant is loaded via `getEnvVar` with no default, a missing value silently degrades fees rather than failing fast — operators MUST verify it is set at deploy time.

### On-ramp flow (EUR SEPA → Base EURC → Nabla swap → user EVM destination)

1. At ramp registration (`prepareMykoboOnrampTransactions` in `ramp.service.ts`), Vortex calls Mykobo `POST /transactions/intent` with `transaction_type=DEPOSIT`, `currency=EURC`, the user's email + IP, the **Base ephemeral address** as `wallet_address`, and `value` as the EUR amount floored to **2 decimal places** (Mykobo silently truncates any extra precision; see invariant below). Mykobo returns IBAN payment instructions (IBAN, bank account name, transaction reference).
2. IBAN instructions are returned to the user **only after** presigned-transaction validation passes (see `transaction-validation.md`).
3. User makes the SEPA bank transfer to Mykobo's IBAN with the returned reference.
4. `mykoboOnrampDeposit`: handler polls the Base RPC for EURC arrival at `evmEphemeralAddress`.
   - **Outer timeout** (`PAYMENT_TIMEOUT_MS`): **24 hours**, matching SEPA business-day cutoffs.
   - **Inner balance-arrival timeout** (`EVM_BALANCE_CHECK_TIMEOUT_MS`): 5 minutes per `checkEvmBalancePeriodically` invocation. Inner timeouts throw `RecoverablePhaseError` and the phase processor re-enters the handler until the outer 24h cap is reached.
   - **Recovery shortcut**: if the ephemeral already holds ≥ 95% of `quote.metadata.mykoboMint.outputAmountRaw` EURC (`EPHEMERAL_FUNDED_TOLERANCE_FACTOR = 0.95`), the handler skips the wait. The 5% tolerance absorbs fee variance between quote-creation time and SEPA settlement time.
   - On outer-timeout expiry, the ramp transitions to `failed` (the user did not pay).
5. `fundEphemeral` (Base ETH gas top-up; same as BRL onramp) → `subsidizePreSwap` (if needed) → `nablaApprove` → `nablaSwap`: Nabla DEX **on Base** swaps EURC → USDC.
6. `subsidizePostSwap` (if needed) → `distributeFees` (Multicall3 batch on Base, see `fee-integrity.md`).
7. If destination is Base + USDC → direct `destinationTransfer` (Squid skipped — see `squid-router.md`). Otherwise → `squidRouterApprove` / `squidRouterSwap` → bridge to user's destination EVM chain → optional `backupSquidRouter*` fallback → `destinationTransfer`.

### Off-ramp flow (User EVM → Base USDC → Base EURC → SEPA payout)

1. User signs Squid permit / no-permit fallback / direct transfer → tokens arrive on Base ephemeral as USDC. If the source is already Base USDC, Squid is skipped.
2. At registration (`prepareEvmToMykoboOfframpTransactions`), Vortex calls Mykobo `POST /transactions/intent` with `transaction_type=WITHDRAW`, `currency=EURC`, the Base ephemeral as `wallet_address`, and `value` set to `quote.metadata.nablaSwapEvm.outputAmount` floored to **2 decimal places** via `Big.toFixed(2, 0)` (Mykobo silently truncates anything beyond 2 dp; intent value, on-chain transfer amount, and Mykobo's accounting MUST agree on the same floored figure). Mykobo returns withdraw instructions including the **`receivables` Base address** (the EVM address that Mykobo monitors for incoming EURC). The Mykobo transaction id and reference are stored in `state.state.mykoboTransactionId` / `mykoboTransactionReference`.
3. `distributeFees` runs **before** Nabla swap so partner/vortex fees are taken in USDC (consistent with the BRLA-on-Base flow; see `fee-integrity.md`).
4. `subsidizePreSwap` → `nablaApprove` → `nablaSwap`: Nabla DEX on Base swaps USDC → EURC.
5. `mykoboPayoutOnBase`:
   1. Sends the presigned ERC-20 EURC transfer of the **2dp-floored** Mykobo intent value (`mykoboFlooredValue × 10^ERC20_EURC_BASE_DECIMALS`) from the ephemeral to the Mykobo `receivables` address. The transfer amount is fixed at registration time and **MUST equal the Mykobo intent `value`** so on-chain credit and Mykobo accounting agree. The sub-cent EURC remainder between `nablaSwapEvm.outputAmountRaw` and the floored transfer amount stays on the ephemeral and is swept by `baseCleanupEurc` in step 6.
   2. On retry, if `mykoboPayoutTxHash` is already in state, the handler waits for that receipt instead of re-broadcasting. If the prior tx reverted, it re-sends the same presigned tx (EVM nonce uniqueness still prevents double-spend).
   3. After the on-chain transfer is confirmed, the handler polls Mykobo `GET /transactions/{id}` every **5s for up to 10 minutes**, looking for `MykoboTransactionStatus.COMPLETED`. `FAILED`, `CANCELLED`, or `EXPIRED` raise an **unrecoverable** error. Polling-error timeouts raise an unrecoverable error if the last polling attempt errored, otherwise a recoverable error.
6. `baseCleanupUsdc` / `baseCleanupEurc` / `baseCleanupAxlUsdc`: sweep dust from the Base ephemeral back to the Base funding account. `baseCleanupEurc` is load-bearing here — it claims the sub-cent EURC remainder left behind by the 2dp floor in step 5.1.

### Profile / KYC flow

Mykobo profiles are user records keyed by the user's email address. They carry KYC fields and are required before Mykobo will accept SEPA deposits / WITHDRAW intents for that user.

- `GET /v1/mykobo/profiles?email=...&memo=...` — Vortex backend proxies `MykoboApiService.getProfileByEmail`. Used by the frontend to detect whether the authenticated user already has a profile. The `email` query parameter MUST match the Supabase-authenticated user's email (`req.userEmail`); mismatched values are rejected at the controller boundary.
- `POST /v1/mykobo/profiles` — Vortex backend proxies `MykoboApiService.createProfile` with multipart form-data (ID document, source-of-funds document, demographics).

The Mykobo KYC widget on the frontend (`MykoboKycFlow`) drives the user through profile creation. The ramp state machine treats Mykobo KYC as a **pre-ramp gate**: the `Deciding` step in the ramp XState machine checks profile presence and routes to the Mykobo KYC flow before allowing ramp registration.

### Why no `mykoboMint` phase

Unlike Monerium (`moneriumOnrampMint` + `moneriumOnrampSelfTransfer`), Vortex does **not** call any Mykobo API to trigger minting. Mykobo's SEPA→EURC settlement is initiated by the user's bank transfer and is observed entirely on-chain via the Base EURC balance of the ephemeral. The handler is therefore a pure balance-poller; there is no Vortex-controlled minting step that can fail mid-flight.

## Security Invariants

1. **Mykobo API credentials MUST be stored as environment variables** — `MYKOBO_ACCESS_KEY`, `MYKOBO_SECRET_KEY`, `MYKOBO_BASE_URL`, and `MYKOBO_CLIENT_DOMAIN` are loaded via `packages/shared` config. Never hardcoded, never in the database.
2. **The Mykobo bearer token MUST never appear in logs or error messages** — `MykoboApiError` captures status + body but not the request headers; review log redaction for any context that includes `Authorization`.
3. **SEPA payment confirmation MUST come from on-chain EURC arrival, not from user input** — `mykoboOnrampDeposit` polls the Base RPC for the ephemeral's EURC balance; it never accepts a "user claims paid" signal.
4. **The on-chain EURC transfer amount (off-ramp) MUST equal the Mykobo intent `value` floored to 2 decimal places** — Computed in `evm-to-mykobo.ts` as `Big(quote.metadata.nablaSwapEvm.outputAmount).toFixed(2, 0)` and converted to raw via `× 10^ERC20_EURC_BASE_DECIMALS`. The presigned `mykoboPayoutOnBase` tx, the Mykobo intent `value`, and the Mykobo `receivables` credit MUST all reference the same floored figure. The sub-cent EURC remainder is intentionally left on the ephemeral for `baseCleanupEurc`. The Mykobo anchor fee was already factored into `quote.outputAmount` at quote-creation time.
5. **The Mykobo `receivables` address MUST come from the Mykobo intent response, not from any client-supplied field** — `mykoboReceivablesAddress` is read from `intent.instructions.address` server-side and stored in `stateMeta`. The user has no way to redirect the off-ramp transfer.
6. **The Mykobo `transaction_type` MUST match the ramp direction** — `DEPOSIT` for on-ramp intents, `WITHDRAW` for off-ramp intents. A mismatch is rejected by Mykobo, but Vortex must not allow client-controlled selection of the type.
7. **The on-ramp intent's `wallet_address` MUST be the Base ephemeral, not the user's destination address** — EURC is settled to the ephemeral so the Nabla swap pipeline can run. Using the user's destination address would bypass the swap and fee distribution.
8. **The off-ramp intent's `wallet_address` MUST be the Base ephemeral** — Mykobo correlates the incoming EURC transfer by the sender wallet; using any other address breaks the WITHDRAW settlement.
9. **SEPA payment details (IBAN, reference) MUST be generated server-side** — Returned by Mykobo's intent response, surfaced to the user only after presigned-transaction validation succeeds. Never client-modifiable.
10. **`mykoboOnrampDeposit` MUST bound its wait** — The 24h `PAYMENT_TIMEOUT_MS` prevents indefinite ramp parking. After 24h with no EURC arrival, the ramp transitions to `failed`.
11. **The 5% pre-funding tolerance MUST only apply to recovery, not to live settlements** — The recovery shortcut compares against 95% of `mykoboMint.outputAmountRaw` to avoid missing an already-funded ephemeral on a rerun. Live `checkEvmBalancePeriodically` still requires the full `expectedAmountRaw`.
12. **`mykoboPayoutOnBase` MUST not advance until both the on-chain transfer is confirmed and Mykobo reports `COMPLETED`** — Confirming only the on-chain side would mark the ramp complete while Mykobo could still reject the deposit.
13. **`MykoboTransactionStatus` of `FAILED` / `CANCELLED` / `EXPIRED` MUST be treated as unrecoverable** — The handler throws via `createUnrecoverableError` so the ramp transitions to a failed state instead of looping.
14. **Recovery on resumed `mykoboPayoutOnBase` MUST detect existing tx hashes** — If `mykoboPayoutTxHash` is in state, the handler waits for that receipt rather than blindly re-broadcasting. If the prior tx reverted, the same presigned tx is re-broadcast — EVM nonce uniqueness prevents double-spend of the ephemeral's EURC.
15. **Mykobo KYC profile creation MUST be gated by Vortex auth** — The `/v1/mykobo/profiles` endpoints require a Supabase OTP session (see `01-auth/supabase-otp.md`); anonymous profile creation is rejected.
16. **Mykobo KYC documents MUST NOT be stored by Vortex** — The frontend submits ID and source-of-funds files directly to the backend, which forwards them to Mykobo as multipart form-data without persisting. No Mykobo profile fields are stored in Vortex's database beyond the email→profile linkage used to look up profile state.
17. **Mykobo HTTP responses MUST be validated** — `MykoboApiService.request` checks `response.ok`, raises `MykoboApiError` with status + body on failure, and re-acquires the token on `401` exactly once before re-throwing. `MykoboApiError` MUST be caught and translated to `RecoverablePhaseError` (transient) or `UnrecoverablePhaseError` (terminal status) at the handler boundary.
18. **Mykobo bearer-token refresh MUST be safe under concurrent requests** — `MykoboApiService.tokenPromise` debounces concurrent `acquireToken` calls so multiple in-flight requests share a single token acquisition. Token refresh is single-use per cached token; on refresh failure the service falls back to re-acquiring with the access/secret keys.
19. **The Mykobo base URL normalization MUST enforce a `/v1` suffix** — `MykoboApiService` trims trailing slashes and appends `/v1` unless the configured `MYKOBO_BASE_URL` already ends in `/v<digits>`. This prevents accidental cross-version calls if an operator sets `MYKOBO_BASE_URL` to a root domain.
20. **`MYKOBO_CLIENT_DOMAIN` MUST be set in every deployment** — The constant is sent as `client_domain` on every Mykobo API call and selects the negotiated fee tier. Because it is loaded via `getEnvVar` with no default, a missing value silently falls back to Mykobo's default tier (worse fees, observed ~5x higher). Deploy-time checks MUST treat an unset `MYKOBO_CLIENT_DOMAIN` as a hard failure.
21. **Mykobo intent `value` MUST be floored to 2 decimal places** — Mykobo silently truncates anything beyond 2 dp, which would otherwise cause the on-chain transfer amount and the Mykobo-credited amount to diverge. Both the on-ramp `DEPOSIT` intent and the off-ramp `WITHDRAW` intent MUST send a 2dp-floored `value`, and the off-ramp on-chain transfer MUST be derived from that same floored value (not from the unrounded Nabla output). The sub-cent EURC remainder on the ephemeral MUST be swept by `baseCleanupEurc`.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **SEPA payment spoofing (on-ramp)** | User claims to have paid without making the SEPA transfer | `mykoboOnrampDeposit` polls the Base RPC for actual EURC arrival; never trusts user signals. |
| **Wrong reference on SEPA** | User sends SEPA with wrong reference, causing misattribution at Mykobo | Reference is generated by Mykobo per intent and shown to the user verbatim; Mykobo correlates by reference at its end. If misattributed, Mykobo will not settle and the 24h timeout fails the ramp. |
| **Off-ramp receivables redirection** | Attacker tries to redirect the EURC payout to a wallet they control | `mykoboReceivablesAddress` is sourced from Mykobo's intent response and baked into the presigned tx at registration time. No client-supplied field reaches the presigned tx target. |
| **Off-ramp amount manipulation** | Attacker modifies the EURC payout amount between quote and execution | Transfer amount is `quote.metadata.nablaSwapEvm.outputAmountRaw`, fixed in the presigned tx at registration. `quote` is immutable post-creation. |
| **Mykobo bearer token compromise** | Bearer token captured in transit or from logs | HTTPS enforced; token never logged; cached in-process only; rotated on `401`. Rotate access/secret keys via Mykobo dashboard on suspected leak. |
| **Mykobo access/secret-key compromise** | Env-var leak exposes long-lived credentials | Keys live in environment only (see `07-operations/secret-management.md`); rotate via Mykobo dashboard; monitor Mykobo dashboard for unauthorized intents. |
| **Mykobo API unavailability** | Mykobo is down during off-ramp polling or on-ramp settlement | Off-ramp `mykoboPayoutOnBase`: polling errors continue retrying up to the 10-minute window; on poll-timeout the handler throws `RecoverablePhaseError` (or unrecoverable if last attempt errored). On-ramp `mykoboOnrampDeposit`: inner balance-check timeouts are recoverable; only the outer 24h cap fails the ramp. |
| **Double on-chain EURC transfer (off-ramp)** | Crash between sending the EURC transfer and storing the hash | Handler waits for receipt before persisting `mykoboPayoutTxHash`. On retry, if no hash is stored, the same presigned tx is re-broadcast — EVM nonce uniqueness on the ephemeral prevents double-spend. |
| **Double Mykobo payout completion** | Bug causes the handler to advance to `complete` before Mykobo `COMPLETED` | Handler awaits `pollMykoboUntilCompleted` before `transitionToNextPhase("complete")`. Any non-`COMPLETED` terminal status raises unrecoverable. |
| **Mykobo terminal status (FAILED / CANCELLED / EXPIRED) mishandled** | Handler retries indefinitely on a permanently failed Mykobo transaction | `createUnrecoverableError` is thrown for those three statuses; ramp transitions to failed instead of looping. |
| **Long-lived on-ramp DOS** | Attacker creates many on-ramps to occupy ephemeral accounts for 24h | Per-user concurrent ramp limit (cross-cutting; see `07-operations/api-surface.md` rate limiting). Ephemerals are user-funded so blast radius is bounded. |
| **TLS downgrade / MITM** | Attacker intercepts Mykobo API calls | HTTPS-only base URL; bearer-token auth depends on TLS; refuse any non-HTTPS `MYKOBO_BASE_URL` configuration at deploy time. |
| **Profile-doc PII leak** | KYC document or PII surfaces in Vortex storage or logs | Documents are streamed through to Mykobo as multipart form-data without persistence; no PII fields stored locally beyond the email→profile-existence linkage. |
| **Cross-version Mykobo API drift** | Operator misconfigures `MYKOBO_BASE_URL` to a root domain, hitting an unintended version | `MykoboApiService` enforces a `/v<digits>` suffix; misconfiguration fails fast on the first auth call. |
| **`MYKOBO_CLIENT_DOMAIN` unset → wrong fee tier** | Operator forgets to set `MYKOBO_CLIENT_DOMAIN`; Mykobo silently applies its default tier (~5x worse fees) and quotes/distributions drift from reality | Deploy-time check fails fast if the env var is missing; alarms on observed Mykobo fees exceeding `defaultDepositFee` / `defaultWithdrawFee` (see `07-operations/secret-management.md`). |
| **Intent-value precision drift** | EURC payout amount carries >2 dp; Mykobo silently truncates and credits less than the on-chain transfer, leaving the user short | Both `DEPOSIT` and `WITHDRAW` intents send `Big.toFixed(2, 0)`-floored `value`; the off-ramp on-chain EURC transfer is derived from the same floored value; sub-cent dust is swept by `baseCleanupEurc`. |

## Audit Checklist

- [ ] Mykobo API credentials loaded from environment variables (not hardcoded, not in database)
- [ ] `MYKOBO_BASE_URL` is HTTPS and resolves to a `/v<digits>`-suffixed Mykobo endpoint
- [ ] `mykoboOnrampDeposit` polls Base RPC for EURC arrival before advancing
- [ ] 24h outer payment timeout enforced; on expiry the ramp transitions to `failed`
- [ ] 5% recovery tolerance applied only to the pre-funded shortcut, not to live polling
- [ ] On-ramp intent `wallet_address` is the Base ephemeral (not the user destination address)
- [ ] Off-ramp intent `wallet_address` is the Base ephemeral
- [ ] Off-ramp `mykoboReceivablesAddress` comes from `intent.instructions.address` (server-side)
- [ ] Off-ramp EURC transfer amount equals the 2dp-floored Mykobo intent `value` (derived via `Big.toFixed(2, 0)`), not the raw `nablaSwapEvm.outputAmountRaw`
- [ ] Both on-ramp `DEPOSIT` and off-ramp `WITHDRAW` Mykobo intents send `value` floored to 2 decimal places
- [ ] `MYKOBO_CLIENT_DOMAIN` is set in every environment (deploy-time check); missing value is a hard failure
- [ ] `mykoboPayoutOnBase` advances to `complete` only after both on-chain confirmation and Mykobo `COMPLETED`
- [ ] `FAILED` / `CANCELLED` / `EXPIRED` Mykobo statuses raise unrecoverable errors
- [ ] Recovery: `mykoboPayoutTxHash` short-circuits on-chain transfer re-broadcast (waits for receipt; re-sends only if prior tx reverted)
- [ ] Mykobo HTTP responses are validated (`response.ok`, status, body)
- [ ] `MykoboApiError` is caught at the handler boundary and mapped to recoverable / unrecoverable
- [ ] Bearer-token refresh is debounced (no thundering-herd on `401`)
- [ ] Bearer token, access key, and secret key do not appear in logs or error messages
- [ ] IBAN payment details surfaced to the user only after presigned-transaction validation passes
- [ ] `/v1/mykobo/profiles` endpoints require Supabase OTP auth (anonymous requests rejected)
- [ ] Mykobo KYC documents are not persisted by Vortex; only the email→profile linkage is stored
- [ ] `GET /v1/mykobo/profiles` rejects requests whose `email` query parameter does not match `req.userEmail` (case-insensitive)
- [ ] HTTPS enforced for all Mykobo API calls
- [ ] Timeout / `AbortController` configured for Mykobo HTTP client (cross-cutting; tracked as F-014 across providers)
- [ ] No Mykobo API call is invoked from a phase handler without an explicit recoverable/unrecoverable mapping
