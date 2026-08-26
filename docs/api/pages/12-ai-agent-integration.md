# AI Agent Integration

This page is written so that an AI coding agent (or a human engineer using one) can build a production-quality Vortex integration in any language or stack. It also explains how to keep these docs themselves useful when retrieved into a coding agent's context.

## A. Using These Docs With An AI Agent

When you point an AI coding agent at Vortex:

- **Anchor the agent on this section first.** Pages 1–11 describe the protocol and contracts; this page describes what a correct client must do.
- **Load the Vortex integration skill if available.** This repository ships a Codex/Agent Skills skill at [`vortex-integration`](https://github.com/pendulum-chain/vortex/tree/main/.agents/skills/vortex-integration). If this repository is open in Codex, the skill is discovered automatically from `$REPO_ROOT/.agents/skills/vortex-integration/SKILL.md`; if you are integrating Vortex from another repository, install the public skill directory URL (`https://github.com/pendulum-chain/vortex/tree/main/.agents/skills/vortex-integration`) first, then match the user's task to the relevant recipe before implementing.
- **Treat the OpenAPI file as the source of truth for shapes**, and these Markdown pages as the source of truth for *behavior, ordering, custody, signing, and timing*. Both are required; neither is sufficient alone.
- **Pin versions.** Record the commit hash of these docs and the version of `@vortexfi/sdk` you are mirroring. The SDK's behavior is the reference implementation; if your integration disagrees with it, the SDK wins.
- **Never let the agent invent endpoints, fields, status values, or fee categories.** If something is not in the OpenAPI file or these pages, the agent should stop and ask.
- **Force the agent to validate every signed payload** before signing: `chainId`, `verifyingContract`, `to`, `value`, `data`, and ramp/phase identifiers must match what your application requested for the current `rampId`.

## B. Picking An Integration Path

| Your runtime | Path |
|---|---|
| Node.js (server-side, trusted) | Use [`@vortexfi/sdk`](https://www.npmjs.com/package/@vortexfi/sdk). |
| Python (server-side, trusted) | Use [`vortex-sdk-python`](https://pypi.org/project/vortex-sdk-python). |
| Browser, mobile, WebView | Use the [Vortex Widget](https://api-docs.vortexfinance.co/widget-integration). |
| Anything else (Go, Rust, Elixir, Java, Ruby, PHP, .NET, Deno, edge runtimes, …) | Reimplement the SDK behavior against the raw API as described in Section D below. |

The SDK paths support BRL (PIX), USD (ACH), MXN (SPEI), COP, and ARS (CBU). EUR (SEPA) BUY currently requires a direct API integration because the linked owner must sign typed data; EUR SELL is unavailable. See [Fiat Corridors](https://api-docs.vortexfinance.co/fiat-corridors) for per-corridor requirements.

Ramping requires an onboarded (KYC/KYB-approved) user. Onboarding is a separate, corridor-specific flow that most corridors also expose through the API — see Section H before assuming the app or Widget is required.

Do not call the raw ramp API from a browser. Browsers cannot safely hold `sk_*` keys or ephemeral secrets. Use the Widget or proxy through a trusted backend.

## C. Python (`vortex-sdk-python`)

`vortex-sdk-python` is a process-bridge wrapper around the native Node.js SDK. It spawns the Node SDK and exposes a Python-friendly surface, so the behavior, custody model, and supported flows match `@vortexfi/sdk` exactly.

```bash
pip install vortex-sdk-python
```

```python
from vortex_sdk import VortexSdk, RampDirection, FiatToken, EvmToken, Networks

sdk = VortexSdk(
    api_base_url="https://api.vortexfinance.co",
    public_key="pk_live_...",
    secret_key="sk_live_...",
    store_ephemeral_keys=True,
)

quote = sdk.create_quote(
    ramp_type=RampDirection.BUY,
    from_="pix",
    to=Networks.Polygon,
    input_amount="150",
    input_currency=FiatToken.BRL,
    output_currency=EvmToken.USDC,
)

ramp = sdk.register_ramp(quote, destination_address="0x...", tax_id="12345678900")
print(ramp.deposit_qr_code)
sdk.start_ramp(ramp.id)
```

Operational notes specific to the Python wrapper:

- A Node.js runtime must be available on the host. The wrapper manages its own Node process.
- Ephemeral key storage rules from the Node SDK apply: by default `ephemerals_{rampId}.json` is written **unencrypted** in the working directory.
- The Node SDK opens three persistent WebSocket connections on init; reuse one `VortexSdk(...)` instance for the lifetime of your service.

Refer to the PyPI page for the latest version, function names, and breaking-change notes: <https://pypi.org/project/vortex-sdk-python>.

## D. Reimplementing The SDK In Any Language

If your stack is neither Node nor Python, build a thin client that mirrors what `@vortexfi/sdk` does. The contract has six parts; implement them in this order.

### D.1 Configuration And Auth

Your client needs:

- `apiBaseUrl` — `https://api.vortexfinance.co` (prod) or `https://api-sandbox.vortexfinance.co` (sandbox).
- `publicKey` — `pk_live_*` / `pk_test_*`. Sent in request bodies as `apiKey` for attribution.
- `secretKey` — `sk_live_*` / `sk_test_*`. Sent as `X-API-Key` header. Server-side only.

Reject startup if a `sk_live_*` key is detected in a browser-shaped runtime.

### D.2 Quote

```
POST /v1/quotes
```

Request body: see [Quotes And Pricing](https://api-docs.vortexfinance.co/quotes-and-pricing). Treat monetary fields as strings end-to-end; never parse them into floats. Store `id`, `expiresAt`, `fee`, and the resolved route. Surface expiry to the caller as a domain error.

### D.3 Register

```
POST /v1/ramp/register
X-API-Key: sk_*
```

Before calling register, generate fresh ephemeral accounts for the chain families used by the resolved route. The API accepts two account types:

- EVM account → a fresh secp256k1 keypair used for all EVM legs.
- Substrate account → a fresh sr25519 keypair used only for routes with Pendulum, AssetHub, or Hydration transactions.

Send only the account types required by the quote. The direct-API EUR BUY flow requires one EVM ephemeral and no Substrate account.

Send **only the public addresses**, in the `signingAccounts` array of the register body:

```json
{
  "quoteId": "QUOTE_ID",
  "signingAccounts": [
    { "type": "Substrate", "address": "5..." },
    { "type": "EVM", "address": "0x..." }
  ],
  "additionalData": { "destinationAddress": "0x..." }
}
```

`type` must be `"Substrate"` or `"EVM"` — these are the only recognized values. The current service ignores entries with any other type, so clients must not rely on those entries creating a signer. There is no `publicKey` field on register — partner attribution rides on the quote's `apiKey`. Persist the secret keys to your secure store, keyed by the not-yet-issued ramp; once the response returns its `id` (the ramp ID), rekey the store entry. Never log the secrets.

The response contains:

- `id` (the ramp ID)
- current ramp state and phase
- `unsignedTxs` — an ordered list of transactions to sign

Each unsigned transaction declares its `network`, `signer` address, transaction format (`evm-transaction`, `evm-typed-data`, or `substrate-extrinsic`), and the payload bytes or fields to sign.

### D.4 Sign And Update

For each unsigned transaction:

1. **Route by signer.**
   - If `tx.signer` equals an ephemeral address you control → sign with the matching ephemeral key.
   - If `tx.signer` equals the user's wallet address → return the payload to the user's wallet for signing (EIP-712 typed data, EVM transaction, or Substrate extrinsic). Never sign user-controlled transactions on the server.
2. **Validate the payload before signing.**
   - `chainId` matches the network the SDK config declared.
   - `to` / `verifyingContract` is one of the Vortex-published contracts for that network.
   - `value`, `asset`, and `amount` match the current ramp quote.
   - For EVM ramps, ephemeral signers must use **5 consecutive nonces** starting from the current account nonce (`NUMBER_OF_PRESIGNED_TXS = 5`).
   - Bump EVM gas: multiply both `maxPriorityFeePerGas` and `maxFeePerGas` returned by the node by **3×** before signing.
3. **Submit the result back to Vortex.**

```
POST /v1/ramp/update
X-API-Key: sk_*
```

Body includes the `rampId`, the transaction reference, and either the signed payload or the broadcast transaction hash. The exact shape is defined in the OpenAPI file; do not guess fields.

### D.5 Fiat Payment And Start

```
POST /v1/ramp/start
X-API-Key: sk_*
```

On a **buy**, where the fiat payment instructions appear depends on the corridor:

- **BRL**: `depositQrCode` (PIX) is released once the presigned transactions submitted via update pass validation — on the update response and on `GET /v1/ramp/{id}`, not on the register response. Show it; wait for the user to pay; then call start. (The SDK performs the update inside `registerRamp`, so SDK callers see it on the returned ramp process.)
- **EUR**: the direct client must first submit the linked owner's EIP-712 permit and every ephemeral signature. `ibanPaymentData` (IBAN, BIC, receiver name, payment reference) is released only after the complete set validates. Show it; the user initiates the SEPA transfer; then call start before the start deadline.
- **USD, MXN, COP, ARS**: call start first; the start response's `achPaymentData` contains the bank transfer instructions for the corridor's rail (ACH, SPEI, CBU). Display them verbatim; the ramp continues automatically once the deposit is confirmed.

On a **supported sell**, the user signs the user-owned transaction(s), you submit them via update, then call start. Vortex pays out to the user's PIX key (BRL) or the saved bank account referenced by `fiatAccountId` (USD, MXN, COP, ARS). EUR SELL is unavailable.

### D.6 Track

- Register a webhook via `POST /v1/webhook` against `quoteId` or `sessionId`. Verify every delivery using RSA-PSS / SHA-256 against `GET /v1/public-key`. See [Webhooks](https://api-docs.vortexfinance.co/webhooks).
- Poll `GET /v1/ramp/{id}` for live user-facing UI.
- Pull `GET /v1/ramp/{id}/errors` for support.

## E. Mandatory Client Responsibilities

These are not optional. The SDK handles them for supported corridors; a custom client must implement them explicitly. The current EUR BUY flow is one such custom-client path.

1. **Ephemeral key custody.** Generate fresh per-ramp keypairs. Store them encrypted, keyed by `rampId`. Keep them until the ramp is `COMPLETE` or `FAILED` **and** any recovery window has passed. Never transmit secrets to Vortex, support, logs, or analytics. See [Ephemeral Key Custody](https://api-docs.vortexfinance.co/ephemeral-key-custody).
2. **Payload validation before signing.** Every field that affects funds movement must match what your application requested.
3. **Idempotency.** Wrap `register`, `update`, and `start` with idempotency keys at your layer. Retries must not produce duplicate ramps.
4. **Retries with backoff.** The Vortex SDK does not retry, time out, or poll on your behalf. Add a retry policy with jittered exponential backoff for transient failures (5xx, network) and surface 4xx errors as terminal.
5. **Quote-expiry handling.** Catch expiry errors on `register`. Create a fresh quote and re-prompt the user.
6. **Webhook signature verification.** Reject any webhook that fails RSA-PSS verification or whose `X-Vortex-Timestamp` is outside an acceptable window (300s is a reasonable default).
7. **HTTPS-only webhook endpoints.** Plain HTTP is rejected.
8. **Persistent state.** Persist `quoteId`, `rampId`, `sessionId`, partner order ID, user identifier, webhook IDs, and a reference to the ephemeral-key backup. Without these you cannot support users or reconcile.
9. **Type safety on amounts.** All monetary fields are decimal strings. Do not parse to float; use a decimal library (e.g. `BigDecimal`, `decimal.Decimal`).
10. **WebSocket lifecycle (if applicable).** If you mirror the SDK's chain-side behavior, expect to maintain Pendulum, Moonbeam, and Hydration WebSocket connections. Reuse one client per process; do not open a new connection per request.
11. **Sandbox / production isolation.** Use `pk_test_*` / `sk_test_*` against `api-sandbox.vortexfinance.co`. Never mix test keys with the live base URL or vice versa.

## F. Things The SDK Does Not Do (And Neither Should A Custom Client Pretend To)

- It does not retry failed HTTP requests.
- It does not poll ramp status; you must poll or use webhooks.
- It does not encrypt ephemeral backups at rest.
- It does not delete ephemeral backups after success.
- It does not drive KYC or KYB; onboard the user through the Vortex app or Widget, or implement the API-driven onboarding flows yourself (Section H).

Mirror those gaps deliberately. If your integration adds behavior the SDK lacks (encryption at rest, backup rotation, idempotency keys, retries), document it for your operators.

## G. Minimum Viable Integration Checklist

Before going live without the SDK:

- [ ] Server-side only; `sk_*` keys never reach a browser.
- [ ] Per-ramp ephemeral keypairs generated and stored encrypted.
- [ ] Every signed payload validated before signing.
- [ ] EVM nonce + gas rules implemented (5 consecutive nonces, 3× gas bump).
- [ ] User-owned transactions routed to the user's wallet, not signed on the server.
- [ ] `POST /v1/ramp/update` called with the exact transaction reference returned by register.
- [ ] Webhook signature + timestamp verification implemented and tested.
- [ ] Quote expiry produces a clean retry path.
- [ ] Sandbox tested for: successful buy, successful sell, expired quote, failed payment, webhook retry, dropped ephemeral signer.
- [ ] Production runbook covers ramp recovery using persisted `rampId` and ephemeral backup.

See also [Production Checklist](https://api-docs.vortexfinance.co/production-checklist).

## H. API-Driven KYC And KYB Onboarding

Where a corridor supports it, onboarding runs through the API without any Vortex UI. The contract has three parts:

1. **Discover the flow.**

   ```
   GET /v1/onboarding/requirements?country=BR&customerType=business
   ```

   Public, no auth. The response is a static workflow index: required `documents`, and ordered `steps` of kind `api` (call the referenced operation), `direct-upload` (HTTP `PUT` of file bytes to a presigned URL returned by the preceding step), or `hosted` (open a provider URL). A `404` means the country/customer-type combination has no supported flow.

2. **Execute the steps in order.** For each `api` step, resolve `requestSchema` against the response's `openapiUrl` — that schema is the complete field contract; never invent fields. Merge in the step's `fixedBody`/`fixedQuery` verbatim, and fill each `derivedValues` entry from the named earlier step's response (e.g. `"body.subAccountId": "step 1 response subAccountId"`). Honor `condition` (skip if not met) and `repeatFor` (run once per document, UBO, or related person). All execution steps require your normal authentication (Section D.1); a managed-profile manager adds `X-Managed-Profile-Id` — see [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys).

3. **Poll for the outcome.** Discovery deliberately omits every `GET`: readiness checks, status polling, and per-corridor behavior (statuses, retry rules, error taxonomies) are documented in [Fiat Corridors](https://api-docs.vortexfinance.co/fiat-corridors). Track completion through `GET /v1/onboarding/status` or the corridor's specific status operation. There is no synchronous approval.

Non-negotiable rules for an agent implementing these flows:

- **Provider state is authoritative.** No client call, completion notification, or `2xx` response marks a user approved. Only the provider's decision, surfaced through the status endpoints, does.
- **Respect the per-flow retry rules.** Onboarding submissions have durable side effects at the provider. The Fiat Corridors page defines, per operation, which failures are safe to retry and which must stop (`409 … requires reconciliation` means stop and contact support — never vary the payload or idempotency key to get past it).
- **BR individuals: the verification method locks permanently.** The first standard document, liveness artifact, submission, or status read commits the account to the `standard` method; a Sumsub token import commits it to `sumsub_share_token` and blocks the standard path. Decide the method before touching either flow.
- **Pin `requirementsVersion`** alongside the docs commit and SDK version you already record (Section A), and re-run discovery when it changes.

### H.1 Onboarding For Your Own Customers (Managed Profiles)

Platforms that onboard their own users headlessly — no Vortex login or UI for the end customer — create **managed child profiles** and run every onboarding and ramp operation on the child's behalf, either with the manager credential plus `X-Managed-Profile-Id` or with child-owned credentials. All discovery-published onboarding steps and the full ramp lifecycle accept this delegation, subject to the manager's corridor policy; webhooks do not (poll instead). The walkthrough with examples is [Managed Profiles](https://api-docs.vortexfinance.co/managed-profiles); the authoritative contract is in [Authentication And API Keys](https://api-docs.vortexfinance.co/authentication-and-partner-keys). Agents implementing this pattern must key their idempotency and state on the manager-scoped `externalSubjectId` → `profileId` mapping, and must complete a BR child's Sumsub token import **before** any status read for that child (the method-lock rule above).

---
