# BRLA / Avenia Integration

## What This Does

BRLA is the Brazilian Real stablecoin used for BRL on/off-ramp operations, accessed via the **Avenia API** (operator of BRLA). All BRL liquidity flow happens on **Base (Ethereum L2)**: there is no BRLA on Moonbeam or Polygon, no XCM/teleport for BRL, and no Pendulum-side BRL handling.

**Temporary disablement:** BRL↔AssetHub on/off-ramps are disabled while the new BRL rail runs on Base. Quote creation does not return those quotes. Both USDC topologies are nevertheless represented by the block catalog so persisted quotes, transaction preparation, and recovery remain deterministic. No separate route assembler remains. Active BRL corridors are BRL↔supported EVM destinations via Base.

**Provider type:** Both (on-ramp and off-ramp)
**Fiat currency:** BRL (Brazilian Real)
**Chain involved:** Base (BRLA is an ERC-20 on Base)
**Block phases:**
- `phases/blocks/phases/avenia-mint/` and `avenia-direct-mint/` — BRL quote simulation, registration, transaction preparation, and Base mint settlement.
- `phases/blocks/phases/avenia-offramp-payout/` — Presigned BRLA transfer to the Avenia-controlled address and PIX payout execution.

### On-ramp flow (BRL → Base USDC → optional Squid → user EVM destination)

1. User receives PIX deposit details (QR code) during ramp registration. The deposit QR code is gated behind successful presigned-tx validation (see `transaction-validation.md`).
2. User makes PIX payment to the Avenia-managed account.
3. `brlaOnrampMint`: Avenia mints BRLA on Base directly to the user's Base ephemeral. The handler first polls the Avenia subaccount balance every 5s (`waitUntilTrueWithTimeout`, 5-minute chunks — `AVENIA_BALANCE_CHECK_TIMEOUT_MS`), then the `evmEphemeralAddress` balance every 1s (`checkEvmBalancePeriodically`, 5-minute chunks — `EVM_BALANCE_CHECK_TIMEOUT_MS`). Each chunk timeout is a recoverable error; the overall payment window of **30 minutes** (`PAYMENT_TIMEOUT_MS`, wall clock since phase entry via `phaseHistory`) is re-checked on every chunk timeout and cancels the ramp (`failed`) when exceeded. Both waits accept the processor's `AbortSignal` so abandoned executions stop polling. (Before 2026-07-08 the Avenia wait ran 30 minutes per execution, which always outlived the processor's 10-minute execution timeout — so the payment-window cancellation never ran for recovered ramps and never-paid onramps churned indefinitely.)
4. `subsidizePreSwap` (if needed) → `nablaApprove` → `nablaSwap`: Nabla DEX **on Base** swaps BRLA → USDC.
5. `distributeFees` (sequential USDC transfers on Base, see `fee-integrity.md`) → `subsidizePostSwap` (if needed).
6. If destination is Base + USDC → direct `destinationTransfer` (Squid omitted). For Base USDT, ETH, AXLUSDC, or EURC → same-chain `squidRouterApprove` / `squidRouterSwap` followed immediately by `destinationTransfer`, with no pay, backup bridge, or final-settlement work. Non-Base EVM outputs use the cross-chain Squid path with pay/fallback/final settlement. BRL→AssetHub is temporarily disabled at quote eligibility and should not reach registration.

For non-Base EVM destinations, the final quote output is the Squid destination-token amount. `quote.outputAmount` MUST be stored with the destination token's decimals (for example, 18 decimals for BSC USDT), and `phases/blocks/phases/destination-transfer/transactions.ts` derives the final raw amount at those decimals. Truncating all BRL on-ramp outputs to 6 decimals would create under-delivery and make phase metadata disagree with Squid's destination raw amount.

#### Degenerate BRL→BRLA-on-Base route (direct bypass)

When the user on-ramps BRL and asks for **BRLA delivered on Base** (input BRL, output BRLA, network Base), the generic pipeline would pointlessly swap BRLA→USDC on Nabla and then bridge/swap USDC→BRLA back to itself. The block catalog selects `BrlOnrampBaseDirect`, whose only monetary transaction is a `destinationTransfer` of the quoted output from the Base ephemeral to the user — no Nabla, fee distribution, Squid, final settlement subsidy, or cleanup. `stateMeta.isDirectTransfer = true`, and the destination-transfer nonce is `0`. This mirrors the intended EUR→EURC-on-Base bypass (`mykobo.md`).

### Off-ramp flow (User EVM → Base USDC → BRLA → PIX)

The catalog resolves every supported EVM source through `BrlOfframpBase`. Its source block owns quote simulation, registration-time source-wallet binding, and the user-wallet transaction blueprints. Its payout block owns authenticated Avenia registration, the trusted deposit wallet, PIX facts, the presigned BRLA transfer, ticket recovery, and Base cleanup approvals. Base USDC uses a direct user transfer; other Base tokens use same-chain Squid; other EVM sources use cross-chain Squid. All variants derive the same runtime phase sequence.

1. User signs Squid permit / no-permit fallback / direct transfer (depending on source chain) → tokens arrive on Base ephemeral as USDC.
2. `distributeFees` runs **before** Nabla swap so partner/vortex fees are taken in USDC.
3. `subsidizePreSwap` → `nablaApprove` → `nablaSwap`: Nabla DEX on Base swaps USDC → BRLA.
4. `brlaPayoutOnBase`:
   1. Sends presigned ERC-20 transfer of `brlaTransferAmountRaw` (= `nablaSwapEvm.outputAmountRaw`) BRLA from the ephemeral to the Avenia deposit address (the Avenia subaccount's EVM wallet).
   2. Polls Avenia's `getAccountBalance(subAccountId)` until the BRLA balance is ≥ `nablaSwapEvm.outputAmountDecimal` (rounded to 2dp). 5s poll interval, 5-minute timeout.
   3. Calls `BrlaApiService.createPayOutQuote({ outputAmount: quote.outputAmount.round(2,0), subAccountId })` — the **PIX payout amount is `quote.outputAmount`**, not the deposited BRLA amount; the difference is the Avenia anchor fee.
   4. Calls `createPixOutputTicket` with the user's PIX key and the subaccount EVM wallet address.
   5. Polls ticket status until `PAID` or `FAILED` (5s interval, 5-minute timeout).

### Subaccount model

Avenia requires a subaccount per user, identified by tax ID (CPF for individuals, CNPJ for businesses). The system creates and manages subaccounts through canonical `provider_customers` rows (`provider = 'avenia'`) owned by the user's `customer_entities` row. `provider_subaccount_id` stores the Avenia subaccount identifier, while normalized tax-ID lookup uses `tax_reference_hash`.

`POST /v1/brla/createSubaccount` accepts an **optional** `quoteId`. In the normal ramp flow it is the quote that triggered onboarding; in quote-less onboarding paths such as the **KYB deep link** (`?kyb` / `?kybLocked` widget entry, where business verification starts before any quote exists) and authenticated dashboard sender onboarding, it is omitted. Quote provenance is not persisted because those write-only fields were dropped in the `provider_customers` cutover. The value is never used as an authorization input, so its absence does not weaken any access check: the ownership guard (below) and authenticated user context gate subaccount creation independently of whether a quote is present.

### Inbound verification webhook (`POST /v1/webhooks/avenia`)

Avenia pushes KYC (individual) and — expected but unconfirmed — KYB (company) attempt
updates to this endpoint. It is the primary trigger for verification result emails; the
hourly `KybStatusWorker` poll is a reconciliation fallback behind it.

This is the only Vortex endpoint authenticated purely by an **inbound RSA signature**
rather than an API key or session. Avenia signs the raw request body with RSA-PSS /
SHA-256; the receiver verifies it against Avenia's published key from `GET /v2/public-key`,
cached for one hour and refetched on a verification miss because Avenia rotates it
without notice. Because anyone can force a miss on a public route, those refetches are
coalesced into one in-flight request, rate-limited to one per 30 seconds, and aborted after
10 seconds if Avenia does not respond.

The route is mounted **ahead of the global JSON body parser** (`config/express.ts`) with
`bodyParser.raw`, because the signature covers the exact bytes sent — a parsed and
re-serialised payload does not reproduce them.

The receiver normalizes both documented envelopes: top-level `subAccountId` and the
event-specific `{ event: { accountId, ... } }` shape. Verification kind is resolved from the
local `provider_customers.customer_type` for that normalized id, never from the payload, so a caller cannot influence which flow an
event is treated as. The recipient is likewise local: the owning `customer_entities.profile_id`,
and an unknown or partner-owned subaccount is acknowledged without notifying anyone. Only
`attempt.id`, `status`, `result`, `resultMessage` and `updatedAt` are consumed; nothing in the
payload updates ramp, quote, or KYC-status state.

Those five fields are runtime-validated before any of them is read (invariant 30). A signed
body is still an untrusted shape: the payload is persisted and later rendered into a user's
inbox, so a missing `status` or `updatedAt` is rejected `400` rather than queued.

### The three-amount model (off-ramp)

Three distinct BRL amounts are involved in `brlaPayoutOnBase`. They are **intentionally different**:

| Amount | Source | Purpose |
|---|---|---|
| `brlaTransferAmountRaw` | `quote.metadata.nablaSwapEvm.outputAmountRaw` | On-chain ERC-20 transfer to Avenia's deposit address. Sends the **full Nabla swap output**. |
| `amountForPayout` (balance check) | `quote.metadata.nablaSwapEvm.outputAmountDecimal` | Sanity check that Avenia received the full deposit before initiating PIX. |
| `amountForQuote` (Avenia PIX payout) | `quote.outputAmount.round(2,0)` | The **net BRL the user receives via PIX**. Equals deposit minus Avenia anchor fee. |

The invariant `transferAmount ≥ payoutAmount` must hold (transfer covers payout + anchor fee). If Nabla underdelivers, the balance-poll timeout fails the phase before any PIX is attempted.

## Security Invariants

1. **Avenia API credentials MUST be stored as environment variables** — API key, secret, and any session tokens come from env vars, never hardcoded.
2. **PIX payout amount MUST equal `quote.outputAmount`** — `createPayOutQuote.outputAmount` is derived from the immutable stored quote; the user receives exactly the quoted net BRL (after Avenia anchor fee).
3. **The on-chain BRLA transfer amount MUST equal `quote.metadata.nablaSwapEvm.outputAmountRaw`** — This guarantees the full Nabla output reaches Avenia; Avenia keeps the anchor fee and pays the user the net amount.
4. **`brlaPayoutOnBase` MUST NOT initiate the PIX payout until the Avenia balance reflects the deposit** — The balance poll prevents calling `createPixOutputTicket` against funds that have not yet been credited.
5. **User tax ID (CPF) MUST be validated** — CPF format validation at ramp registration, not at payout time.
6. **Avenia subaccount creation MUST be idempotent** — If a subaccount already exists for a tax ID, the system must not create a duplicate.
7. **PIX payment confirmation MUST be verified before advancing on-ramp** — `brlaOnrampMint` polls the Base ephemeral balance; advancement only on confirmed BRLA arrival.
8. **Avenia API responses MUST be validated** — Status codes, ticket IDs, and amount confirmations must be checked. `AveniaTicketStatus.FAILED` must throw an unrecoverable error; `AveniaTicketStatus.PARTIAL_FAILED` must be handled as a ticket-specific partial failure and must not be polled indefinitely or treated as a generic success.
9. **Avenia interactions MUST be retryable** — Transient Avenia API failures throw `RecoverablePhaseError`; the phase processor retries.
10. **Recovery on resumed `brlaPayoutOnBase` MUST detect existing tickets** — If `payOutTicketId` is already in state, the handler skips re-issuing the PIX ticket and only polls status (prevents double-payout).
11. **Recovery on resumed on-chain transfer MUST detect existing tx hashes** — If `brlaPayoutTxHash` is in state, the handler waits for that receipt rather than re-broadcasting (prevents double on-chain BRLA transfer).
12. **PIX deposit details (QR code) MUST be generated server-side** — Returned via API response only after presigned transactions are validated, never client-modifiable.
13. **BRL↔AssetHub MUST stay disabled while the Base BRL rail is active-only** — The quote engine MUST reject both BRL→AssetHub and AssetHub→BRL before block simulation even though both USDC flows are cataloged for persisted-quote preparation/recovery. Catalog presence alone MUST NOT imply quote eligibility.
14. **The BRL→BRLA-on-Base on-ramp MUST take the direct-transfer bypass** — When `inputCurrency === BRL`, `outputCurrency === BRLA`, and `network === Base`, `isBrlToBrlaBaseDirect` MUST short-circuit the route to a single `destinationTransfer` from the ephemeral to the user, with `stateMeta.isDirectTransfer = true`. The Nabla swap, `distributeFees`, SquidRouter, `finalSettlementSubsidy`, and Base cleanup phases MUST NOT run — routing BRLA through USDC and back would burn double-swap slippage/fees against the user and expose the over-subsidy race (`06-cross-chain/fund-routing.md`). The `squidRouterSwap` and `finalSettlementSubsidy` handlers MUST also honor `isDirectTransfer`/`isBrlToBrlaBaseDirect` defensively and skip to `destinationTransfer` if reached.
15. **BRL→EVM quote output precision MUST match the destination token** — For supported EVM destinations, `quote.outputAmount` MUST preserve the destination token's decimal precision, and `evmToEvm.outputAmountRaw` MUST represent the destination token's raw units. The Squid bridge input remains Base USDC raw (`evmToEvm.inputAmountRaw`), but final delivery uses destination-token decimals.
16. **BRL register paths MUST derive tax ID / subaccount from the effective user** — The catalog flow's `AveniaMint.register` and `AveniaOfframpPayout.register` hooks resolve the Avenia account via `resolveAveniaAccountForRamp(userId, additionalData.taxId)` and call the block-owned `createAveniaOnrampTicket` / `validateAveniaOfframpRecipient` logic in `phases/blocks/core/avenia-registration.ts`. That module owns pending-BRL aggregation, BRL/global limit enforcement, PIX-owner masked-tax-ID matching, trusted subaccount wallet resolution, and onramp ticket creation. A client-supplied `additionalData.taxId` is accepted only when it matches the derived value (enforced identically on the onramp and offramp paths); mismatches return `400`. `additionalData.receiverTaxId` may legitimately differ from the sender and is validated downstream against the PIX key owner. `RampService` only dispatches through the flow recorded in quote metadata and projects phase-owned facts/artifacts into legacy ramp state; it does not own Avenia registration operations.
17. **`/v1/brla/getUser` and `/v1/brla/getUserRemainingLimit` MUST scope reads to the effective user** — When a `taxId` query is provided, the matching Avenia `provider_customers` row MUST belong to a `customer_entities` row owned by `getEffectiveUserId(req)`. When `taxId` is omitted, the endpoint derives the user's Avenia account via the resolver and returns `400` for zero or multiple KYC-completed matches. The legacy partner-key exemption that allowed reading any taxId has been removed; bare partner keys without a profile binding and fully anonymous callers are rejected with `400`.
18. **`/v1/brla/createSubaccount` MUST require an authenticated principal and use only canonical identity** — The route uses `requirePartnerOrUserAuth()` and the controller requires an effective user. Bare partner keys and anonymous callers receive `400`; the Avenia API is not called and no `provider_customers` row is created. Existing-tax-ID conflict and reuse decisions inspect only canonical Avenia `provider_customers` ownership. The controller does not query or adopt rows from `tax_ids`.
19. **BRL quote creation MUST remain anonymous-eligible while register/start remain user-gated** — `POST /v1/quotes` and `POST /v1/quotes/best` accept BRL corridors from anonymous callers and partner-key callers (with or without a `userId` binding). The Avenia `createPayInQuote` calls used by the BRL engines do not require a user-bound principal. The actual Avenia subaccount/taxId resolution still happens server-side at register time via `resolveAveniaAccountForRamp(effectiveUserId, additionalData.taxId)`. `POST /v1/ramp/register` requires Supabase or secret-key credentials, and `RampService.registerRamp` rejects provider-backed ramps without an effective user with `400 Invalid quote`. **An anonymous BRL quote may be claimed by an authenticated caller** (the normal web-app funnel: quote before login, register after) — claiming is not an escalation because the anonymous quote carries no owner and the Avenia identity is derived from the claimer's own KYC records, never from the quote or request body.
20. **`brlaPayoutOnBase` MUST verify the ephemeral's BRLA balance before the first broadcast of the presigned transfer** — The presigned payout is single-use (its nonce is consumed even on revert), so the handler calls `ensurePresignedTransferFunded` before `sendRawTransaction`: sender/token/amount are decoded from the signed raw tx and the ephemeral balance is polled (3-minute timeout); a shortfall raises a recoverable error instead of burning the nonce. The Avenia-side balance poll (invariant 4) runs after this on-chain transfer and does not replace it. See `03-ramp-engine/ramp-phase-flows.md` invariant 12.
21. **Avenia company KYB completion MUST be provider-confirmed and ownership-bound** — `POST /v1/brla/kyb/new-level-1/web-sdk` stores the returned Avenia `attemptId` as the owned business `kyc_cases.provider_case_id`. `GET /v1/brla/kyb/attempt-status` accepts only a case owned by the effective user, queries that exact attempt, persists normalized status on both the case and provider customer, and returns only `status`, optional `result`, and optional normalized `failureReason`. Client-side events cannot assert completion: only provider `COMPLETED` plus `APPROVED` may complete onboarding; `REJECTED`, `EXPIRED`, `PENDING`, and `PROCESSING` must not pass the parent verification gate.
22. **A KYB attempt Avenia has not started processing MUST stay canonical `pending`, never `in_review`** — Company subaccount creation and KYB link initiation record `pending` (the attempt is `PENDING` at Avenia until the user completes the hosted steps); `in_review` is set only once Avenia reports `PROCESSING`. While the bound attempt's stored external status is still `PENDING`, re-initiation by the owner is allowed and rebinds the case to the fresh `attemptId` (the hosted URLs are never stored, so this is the only resume path); the `409` conflict applies once the attempt is `PROCESSING` or decided. Because the stored status can lag, re-initiation additionally probes the live attempt and refuses (`409`) when Avenia reports it processing or approved — a rejected decision stays re-initiable, and a failing probe falls back to allowing the resume. This cannot be used to bypass verification: a fresh attempt restarts at `PENDING` and invariant 21's completion gate is unchanged. To support form-less resume, `GET /v1/onboarding/status` exposes `taxReference` (the CNPJ) for **business** rows only — the response is already scoped to the caller's own entities, and individual CPFs remain unexposed.
23. **BRL Base destination variants MUST use token-specific static topology** — Base USDC MUST omit Squid entirely. Other configured non-BRLA Base outputs MUST execute exactly one same-chain `squidRouterSwap` phase before `destinationTransfer`; transaction preparation MUST use the Base builder, omit `squidRouterPay` and backup transactions, and allocate `destinationTransfer` at the nonce immediately after the Squid swap. BRLA remains the direct bypass in invariant 14.
24. **Dashboard BRL BUY confirmation MUST not bypass PIX verification** — The dashboard displays the server-generated `depositQrCode`, keeps the ramp unstarted, and calls `/ramp/start` only after the user confirms submitting PIX. That click is not proof of settlement; `brlaOnrampMint` must still verify the Avenia/Base balance before advancing.
25. **Unified BRL limit reads MUST use the authenticated user's provider account** — `POST /v1/limits` MUST derive the Avenia subaccount through `resolveAveniaAccountForUser`; it MUST NOT accept a caller-supplied tax ID or subaccount. BRL `max`, `used`, year, and month are mapped directly from Avenia's BRL fiat-in/fiat-out limit row. Tax IDs and provider subaccount IDs are never returned.
26. **Managed BRLA operations MUST remain child- and corridor-scoped** — Supported customer, KYC/KYB, and onboarding-status routes may derive the effective user from a verified manager selector or direct child credential. Mutating provider/KYC operations require the controlling manager's current `BR` corridor; status and account reads preserve access after corridor removal. Tax IDs and subaccount IDs still require ownership through the child's customer entities. Subaccount creation MUST reject a requested account type that differs from the child's provisioned customer-entity type before calling Avenia, preventing a managed child from acquiring a second entity. `GET /v1/brla/validatePixKey` remains an anonymous preflight utility rather than a managed-child operation: presenting a credential grants no capability unavailable to an anonymous caller, so managed corridor policy does not apply to it.

26. **The Avenia webhook MUST reject any body whose RSA-PSS signature does not verify** — Verification runs against the raw request bytes before the payload is parsed or any lookup happens. An absent `Signature` header, a non-buffer body, or a failed verify MUST return 401 and MUST NOT enqueue anything.
27. **The Avenia webhook MUST NOT mutate ramp, quote, or verification state** — Its only effect is an `email_notifications` row. A forged or replayed event therefore cannot advance a ramp, approve a user, or move funds; the worst case is a duplicate-suppressed email.
28. **Webhook-triggered emails MUST remain idempotent under replay** — Avenia's signature carries no timestamp or nonce, so replay is not prevented at the transport level. It is neutralised by the `(provider, type, resource_id)` unique index keyed on the Avenia attempt id: a replayed event, or a poll racing a webhook, cannot produce a second email.
29. **Public-key refetches on a signature miss MUST be bounded** — The route is unauthenticated, so any caller can force a miss. Refetches are coalesced into one in-flight request, rate-limited to one per 30-second cooldown, and aborted after 10 seconds; a miss inside the cooldown is rejected without an outbound call. Key rotation is still picked up (within the cooldown), but forged bodies cannot be amplified into load on Avenia or leave a verifier waiting indefinitely.
30. **The webhook body MUST be runtime-validated before any property is read** — A valid signature proves only that Avenia sent the bytes. `JSON.parse` alone admits `null`, arrays, scalars, and attempts missing the fields an email is rendered from, so the receiver accepts Avenia's two documented envelopes (top-level `subAccountId` or nested `event.accountId`), normalizes them, and validates the account id plus `subscription` and, when one is present, the attempt (`id`, `status`, `updatedAt` as non-empty strings; `result` and `resultMessage` as strings when present) before the first property access or database lookup. Anything failing that returns a deterministic `400` and enqueues nothing. An unrecognised *value* of `status` or `result` is not a validation failure: it is a well-formed event with no email mapped to it, and is acknowledged `200` so Avenia does not retry it indefinitely.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **PIX payment spoofing (on-ramp)** | Attacker claims PIX payment was made without actually paying | System polls Base RPC for actual BRLA arrival; never trusts user claim. |
| **Tax ID fraud** | Attacker uses someone else's CPF to receive off-ramp payouts | Tax ID validation is Avenia's responsibility at KYC level; Vortex passes through validated data only. |
| **Double payout (off-ramp)** | Bug causes `createPixOutputTicket` to be called twice for the same ramp | (a) Phase processor's per-ramp lock prevents concurrent execution; (b) `payOutTicketId` recovery branch skips re-issue; (c) `brlaPayoutTxHash` recovery branch skips re-broadcast. |
| **Double on-chain transfer** | Crash between sending the BRLA transfer and storing the hash | Handler stores `brlaPayoutTxHash` only after the receipt. On retry, if no hash is stored, the same presigned tx is re-broadcast — EVM nonce uniqueness prevents double-spend. |
| **Avenia API compromise** | Attacker intercepts or manipulates Avenia API calls | HTTPS enforced; balance verified on-chain against deposit; PIX amount derived from immutable quote. |
| **Amount manipulation between quote and payout** | Attacker modifies the payout amount between quote and execution | `quote.outputAmount` read from DB at execution time; quote is immutable post-creation. |
| **Avenia service outage or partial ticket failure** | Avenia API is unreachable mid-ramp, or a ticket reaches `PARTIAL-FAILED` after one leg completed and a later leg failed | `RecoverablePhaseError` → phase processor retries transient outages. `PARTIAL-FAILED` must be treated as ticket-specific failure with prior completed legs preserved; callers may retry only after reconciling source/destination balances. |
| **Subaccount data leak** | Avenia subaccount details exposed via API | Canonical `provider_customers` stores the provider subaccount ID and normalized tax reference; account reads are scoped through the owning customer entity. |
| **Underdelivery from Nabla** | Nabla swap returns less BRLA than quoted, balance poll times out, ramp stuck | Balance-poll timeout (5min) fails the phase as recoverable; `subsidizePostSwap` (EVM branch) tops up eligible shortfalls subject to the env-configured split quote-relative EVM subsidy caps documented in `fund-routing.md`. The actual-vs-quoted swap discrepancy is capped at the greater of $1.00 and `MAX_EVM_SWAP_SUBSIDY_QUOTE_FRACTION` × quote output; the discount component uses `MAX_EVM_POST_SWAP_DISCOUNT_SUBSIDY_QUOTE_FRACTION` (no floor). Both fractions default to `0.05`. |
| **Disabled AssetHub corridor accidentally re-enabled** | A developer mistakes either cataloged recovery flow for an eligible production corridor | Quote eligibility rejects both BRL→AssetHub and AssetHub→BRL before simulation. Flow and transaction tests may resolve the flows directly, but any successful public quote remains a regression until intentional re-enablement. |
| **BRL→BRLA-Base self-swap drain** | The generic pipeline swaps the user's already-minted BRLA to USDC and back, charging two swaps of slippage/fees and triggering `finalSettlementSubsidy` against bridge-less dust (over-subsidy + strand) | `isBrlToBrlaBaseDirect` collapses the corridor to a single `destinationTransfer` with `isDirectTransfer = true`; Nabla/distributeFees/Squid/finalSettlementSubsidy/cleanup are skipped at both route-build and handler level. |
| **Anonymous BRL register on someone else's subaccount** | An anonymous SDK caller (no Supabase session, no linked secret key) uses an anonymous BRL quote to register a ramp on top of another user's Avenia subaccount via the quoteId guess | `RampService.registerRamp` rejects provider-backed ramps without an effective user with `400 Invalid quote`; an attacker cannot bind a BRL ramp to a subaccount they do not own. |
| **Claiming an anonymous BRL estimate at register time** | Attacker mints an anonymous BRL quote, then presents a Supabase token (or a different user's linked secret API key) at register time to bind the resulting ramp to a different user's Avenia provider customer | An authenticated caller may claim an ownerless quote; `RampService.registerRamp` rejects only when both `quote.userId` and `request.userId` are non-null and differ. Provider identity is derived from the authenticated caller's canonical Avenia account, so the quote cannot select another user's provider customer. |
| **Forged verification webhook** | Attacker posts a fabricated `verification_approved` event for another user's subaccount | Body must carry a valid RSA-PSS signature from Avenia's published key; unsigned or mis-signed bodies are rejected 401 before any DB lookup. Even a valid event only enqueues an email — it grants no entitlement. |
| **Webhook replay** | Attacker re-sends a captured, correctly-signed event repeatedly | Avenia provides no timestamp or nonce to check. Enqueue is idempotent on the attempt id, so replays collapse to a no-op; no email amplification is possible. |
| **Key-rotation denial of service** | Avenia rotates the signing key; genuine events start failing verification | Key is fetched, never pinned; a failed verify against the cached key triggers exactly one refetch before rejection, so rotation self-heals within one request. |
| **Unknown-subaccount probing** | Attacker uses signed events to enumerate which subaccounts Vortex knows | Requires a valid Avenia signature, so it is not reachable by an external attacker; responses are an identical `200 {received:true}` for known, unknown, and partner-owned subaccounts. |
| **Destination-token decimal under-delivery** | A BRL on-ramp targets an 18-decimal token such as BSC USDT, but the quote output is truncated to 6 decimals before `destinationTransfer` raw amount construction. | On-ramp finalization uses destination-token decimals for BRL EVM outputs; Squid metadata preserves destination raw output from `route.estimate.toAmount`. |
| **Company KYB status bypass or cross-user attempt lookup** | A browser asserts that hosted verification finished, or probes another user's Avenia attempt ID and receives provider submission metadata. | Initiation binds the attempt to the authenticated user's KYB case; status lookup checks that binding before the provider call, minimizes its response, and the client/parent accept only provider-confirmed `COMPLETED` + `APPROVED`. |

## Audit Checklist

- [x] Avenia API credentials loaded from environment variables (not hardcoded). **PASS** — credentials loaded via env config.
- [x] `brlaOnrampMint` polls Base RPC for BRLA arrival before advancing. **PASS** — `checkEvmBalancePeriodically` against `evmEphemeralAddress` for up to 30 minutes.
- [x] BRL↔AssetHub temporarily disabled. **PASS** — `QuoteService` explicitly rejects both directions before simulation. `BrlOnrampAssethubUsdc` and `BrlOfframpAssethubUsdc` remain cataloged only for persisted preparation/recovery; catalog and disabled-gate tests enforce the distinction.
- [x] `brlaPayoutOnBase` PIX amount equals `quote.outputAmount`. **PASS** — `createPayOutQuote.outputAmount = amountForQuote = new Big(quote.outputAmount).round(2,0)`.
- [x] On-chain BRLA transfer amount equals the subsidy-adjusted full swap output. **PASS** — `metadata.blocks.aveniaOfframpPayout.transferAmountRaw` is derived from the post-subsidy BRLA phase input and is used unchanged by the payout transaction preparer; the PIX amount remains immutable `quote.outputAmount`.
- [x] User CPF/tax ID is validated at ramp registration (not at payout). **PASS** — CPF validation present in registration flow.
- [x] Avenia subaccount creation is idempotent. **PASS** — checks existing subaccount before creating.
- [x] Recovery: `payOutTicketId` short-circuits ticket re-creation. **PASS** — verified in `phases/blocks/phases/avenia-offramp-payout/execution.ts`.
- [x] Recovery: `brlaPayoutTxHash` short-circuits on-chain transfer re-broadcast. **PASS** — verified in `phases/blocks/phases/avenia-offramp-payout/execution.ts`.
- [ ] Avenia API responses are validated (status, amount, ticket ID). **PARTIAL** — ticket status checked for `PAID`/`FAILED`; `PARTIAL-FAILED` is modeled and the rebalancer handles it for Polygon transfer tickets, but API payout handlers still treat only `FAILED` as terminal; no explicit amount cross-check on `getAccountBalance` response shape.
- [x] `RecoverablePhaseError` used for transient Avenia API failures. **PASS** — `createRecoverableError` wraps `sendBrlaPayoutTransaction` failures and ticket-status timeouts.
- [x] HTTPS enforced for all Avenia API calls. **PASS** — base URL uses `https://`.
- [ ] No Avenia API credentials or user tax IDs appear in logs. **PARTIAL** — `payOutTicketId` is debug-logged with the literal CPF subaccount; review log redaction.
- [x] Dashboard BRL onramps render only the server-issued PIX QR/copy payload, use ephemeral-only signing, and do not call `/ramp/start` before explicit payment confirmation; Avenia/Base balance verification remains authoritative. **PASS**.
- [ ] **F-014**: Timeout configured for Avenia HTTP client. **FAIL** — relies on default system/library timeouts; no explicit `AbortController` on `BrlaApiService` calls.
- [x] PIX deposit details (QR code) generated server-side. **PASS** — comes from Avenia API response.
- [x] PIX deposit details released to user only after presign validation. **PASS** — gated by `ephemeralPresignChecksPass` (see `transaction-validation.md`).
- [ ] Avenia interactions logged for reconciliation (amounts, not credentials). **PARTIAL** — info logs include amounts; no formal reconciliation log with structured fields.
- [x] **FINDING F-064 (MEDIUM)**: BRLA KYC callback endpoint requires authentication. **PASS (FIXED)** — `/kyc/record-attempt` uses `requirePartnerOrUserAuth()` and delegated requests additionally require active BR authorization.
- [x] BRL→BRLA-on-Base on-ramps emit only provider mint, funding, and `destinationTransfer` — no Nabla, fee distribution, Squid, final settlement, or Base cleanup transaction. **PASS** — `phases/blocks/flows/brl-onramp-base-direct.ts`.
- [x] The BRL→BRLA direct flow omits Squid and final settlement rather than relying on executor short-circuits. **PASS** — `phases/blocks/flows/brl-onramp-base-direct.ts`.
- [x] BRL→EVM destination-token precision preserved. **PASS** — block flow simulation preserves Squid destination raw output and destination-token decimals.
- [x] BRL Base output topology is token-specific. **PASS** — block catalog resolution maps USDC to the no-Squid flow, BRLA to the direct bypass, and USDT/ETH/AXLUSDC/EURC to the one-phase same-chain Squid flow; flow and transaction tests enforce Base construction and contiguous destination nonce ordering.

## Remediation Notes

- **Hardcoded BRL offramp validation amount:** Resolved in the remediation pass; BRL offramp validation now derives the pre-anchor amount from quote metadata instead of a literal placeholder.
- **EVM subsidy USD caps:** Resolved for the Base EVM subsidy handlers via env-configured quote-relative cap fractions. `MAX_EVM_SWAP_SUBSIDY_QUOTE_FRACTION` and `MAX_EVM_POST_SWAP_DISCOUNT_SUBSIDY_QUOTE_FRACTION` both default to `0.05` and can be overridden through environment variables; the pre-swap and post-swap discrepancy caps additionally floor at $1.00 so small quotes retain a workable subsidy allowance. Over-cap cases are intentionally recoverable retries: no subsidy transfer is submitted, and the ramp remains waiting for operator action rather than becoming unrecoverably failed.

## Provider-customers cutover (2026-07)

Avenia identity moved from `tax_ids` (raw-tax-id PK, nullable owner) to
`provider_customers` (`provider = 'avenia'`), owned via `customer_entities` (owner is NOT NULL).
Key properties:

- Lookups key off `tax_reference_hash` (sha256 of the normalized tax id). The raw normalized
  value is retained in `tax_reference` because it is the join/aggregation key for in-flight
  ramp state (`ramp_states.state.taxId`, block-owned `getPendingBrlVolume`) — a documented deviation from
  the unified doc's "no raw tax IDs" non-goal, to be revisited once legacy ramp state drains.
  No masked copy is persisted; masked display is derived with `maskTaxReference` at read time.
- `status` uses the shared canonical verification enum. Avenia's unmodified attempt status is
  mirrored to `status_external` whenever polling returns one; the attempt result determines the
  canonical terminal status. The initial `Consulted` interaction maps to `started`, while
  `Requested` and active attempt processing map to `in_review`; a missing or expired attempt maps
  to `pending`. For company KYB, subaccount creation and a still-`PENDING` attempt also map to
  `pending` (resumable — the user has not completed the hosted steps); only `PROCESSING` maps to
  `in_review` (invariant 22).
- Business rows may store a nullable `company_name`. It is set from the name accepted during
  subaccount creation and missing legacy values are lazily refreshed from Avenia account info.
- Migration 060 permanently deletes `tax_ids`, including ownerless/quarantined rows and any
  provider subaccount references that were not migrated. This loss is intentionally approved and
  irreversible; no adoption path or archive remains, and recovery requires restoring the
  pre-migration database backup. All live onboarding and ownership checks use `provider_customers`.
- Ownership gaps closed in the cutover: `fetchSubaccountKycStatus` (which also WRITES status
  transitions) and `getSelfieLivenessUrl` require the effective user to own the account.
  KYB initiation stores Avenia's opaque attempt ID in the owned `kyc_cases.provider_case_id`;
  `getKybAttemptStatus` resolves that binding and verifies ownership before querying Avenia.
  The browser receives only normalized status/result fields, never provider submission data.
- Ownership is profile-level: a row must belong to one of the effective user's customer
  entities, never to a specific typed or active entity. Migration 040 attached legacy business
  rows to the profile's individual entity, so comparing against a single resolved entity
  403'd/409'd the legitimate owner and findOrCreate'd stray empty entities as a read side
  effect. Every Avenia ownership check (`getAveniaUser`, `getAveniaUserRemainingLimit`,
  `fetchSubaccountKycStatus`, `getSelfieLivenessUrl`, `getUploadUrls`, `newKyc`,
  `initiateKybLevel1`, `getKybAttemptStatus`, the `createSubaccount` conflict check) scopes
  across all owned entities via `findCustomerEntityIdsForProfile`. Ramp-time resolution
  (`resolveAveniaAccountForUser`) searches all owned entities too; when a multi-entity profile
  owns several approved accounts, the active entity's account wins and anything else is
  rejected as ambiguous. `createSubaccount` defers typed-entity creation to the branches
  that persist a new row, so a retry that updates an existing row creates no entity.
  Cross-profile requests still fail closed.
- KYC/KYB state transitions update canonical status and provider status on both
  `provider_customers` and the account's `kyc_cases` row in the same code path.
  `updateAveniaKycOutcome` treats `approved` as terminal (a stale attempt read never
  downgrades an approved account) but otherwise follows the latest provider attempt:
  in particular, a `rejected` account whose retried attempt succeeds becomes `approved`
  (the former `in_review`-only guard left it stuck in `rejected`, so a successfully
  retried KYC never became ramp-ready). Repeated polls of an unchanged outcome no-op.
