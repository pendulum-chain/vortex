---
name: vortex-integration
description: Use when integrating Vortex or @vortexfi/sdk, including quotes, BRL PIX onramps/offramps, ramp register/update/start/status flows, webhook verification, ephemeral key custody, supported corridors, sandbox/production auth, and recovery from ramp errors.
---

# Vortex Integration Skill

A machine-loadable capability catalog for AI coding agents integrating Vortex into third-party applications. Start by reading **Global Context**, then match the user's task to the closest recipe below before implementing. Each recipe includes trigger phrases plus a minimal SDK and/or REST form.

> **Companion document**: [AI Agent Integration](https://api-docs.vortexfinance.co/ai-agent-integration) covers the raw-API contract, mandatory client responsibilities, and language-agnostic guidance. This skill focuses on **task-shaped recipes** an agent can match against user intent.

---

## Global Context (read once)

- **SDK**: `@vortexfi/sdk` (JavaScript/TypeScript). Install: `npm i @vortexfi/sdk`.
- **API base URLs**: production `https://api.vortexfinance.co`, sandbox `https://api.sandbox.vortexfinance.co`.
- **Auth keys**: partner integrations use a key pair.
  - `pk_live_*` / `pk_test_*` — public key, sent in request bodies for partner attribution.
  - `sk_live_*` / `sk_test_*` — secret key, sent in the `X-API-Key` header. **Never expose `sk_*` in a browser or mobile app.**
- **Decimals**: all amounts are strings. Never parse them through JS `Number` — use `BigInt`, `decimal.js`, or equivalent.
- **Quote TTL**: quotes expire (see `expiresAt`). Re-quote, never reuse stale quotes.
- **Ramp counts**: ephemeral keys sign exactly 5 presigned transactions per ramp. The API rejects anything else.
- **Currently implemented corridors**: BRL (PIX) onramp and offramp. EUR (SEPA) types exist in the SDK but the handlers throw `"Euro onramp handler not implemented yet"` / `"Euro offramp handler not implemented yet"` at runtime. Treat EUR as `status: planned`.
- **No secret in markdown**: never paste API keys into source files, logs, screenshots, or support tickets.

---

```yaml
---
name: get-quote
description: Create or fetch a price quote for an on-ramp or off-ramp before starting a ramp.
triggers:
  - "get a quote"
  - "price an onramp"
  - "price an offramp"
  - "how much will the user receive"
  - "what's the rate"
  - "createQuote"
---
```

## When to use
The first call in any ramp flow. A quote pins the price, fees, and route for a short window (see `expiresAt`). You must hold a non-expired quote to call `registerRamp`.

## Prerequisites
- Valid API key pair (`pk_*` + `sk_*`).
- Known input currency, output currency, amount, and target network.

## SDK recipe
```js
import { VortexSdk, FiatToken, EvmToken, Networks, RampDirection } from "@vortexfi/sdk";

const vortex = new VortexSdk({
  apiBaseUrl: "https://api.vortexfinance.co",
  publicKey: process.env.VORTEX_PUBLIC_KEY,
  secretKey: process.env.VORTEX_SECRET_KEY
});

// BRL → USDC on Polygon
const quote = await vortex.createQuote({
  rampType: RampDirection.BUY,
  from: "pix",
  to: Networks.Polygon,
  inputAmount: "100",
  inputCurrency: FiatToken.BRL,
  outputCurrency: EvmToken.USDC,
  network: Networks.Polygon,
  paymentMethod: "pix"
});

console.log(quote.id, quote.outputAmount, quote.expiresAt, quote.fees);
```

To retrieve a previously created quote:
```js
const sameQuote = await vortex.getQuote(quote.id);
```

## REST fallback
```bash
curl -X POST https://api.vortexfinance.co/v1/quotes \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $VORTEX_SECRET_KEY" \
  -d '{
    "rampType": "BUY",
    "from": "pix",
    "to": "Polygon",
    "inputAmount": "100",
    "inputCurrency": "BRL",
    "outputCurrency": "USDC",
    "network": "Polygon",
    "paymentMethod": "pix",
    "publicKey": "'"$VORTEX_PUBLIC_KEY"'"
  }'
```

For the best price across all networks, use `POST /v1/quotes/best` (same body, omit `network`). To fetch an existing quote: `GET /v1/quotes/:id` (no auth required).

## Common failures
- `MissingRequiredFieldsError` — missing input/output/amount/network.
- `InvalidNetworkError` — `network` not in the supported list (see `discover-supported-corridors`).
- `400` with `EuroOnrampHandlerNotImplemented` — EUR corridors are planned, not active.
- Quote returned but unused for > TTL → `QuoteExpiredError` on subsequent `registerRamp`. Re-quote.

---

```yaml
---
name: start-onramp-brl
description: Initiate a BRL-to-crypto onramp via PIX. End user pays a PIX QR code, receives crypto on the chosen EVM/AssetHub network.
triggers:
  - "start onramp"
  - "buy crypto with BRL"
  - "BRL to USDC"
  - "PIX onramp"
  - "fiat to crypto Brazil"
---
```

## When to use
The user is in Brazil (or has BRL/PIX access) and wants to buy crypto. KYC must be completed beforehand through the Vortex app or Widget — `taxId` (CPF/CNPJ) is the required link.

## Prerequisites
- Fresh quote with `rampType: BUY`, `from: "pix"`, `inputCurrency: FiatToken.BRL`.
- `destinationAddress` — the user's wallet on the target network.
- `taxId` — the user's CPF or CNPJ; must match a KYC'd Vortex subaccount.

## SDK recipe
```js
const { rampProcess } = await vortex.registerRamp(quote, {
  destinationAddress: "0xUserWalletAddress",
  taxId: "12345678900"
});

// Show user the PIX payment instructions
console.log(rampProcess.depositQrCode);  // base64 PNG or PIX copy-paste string
console.log(rampProcess.id);             // persist this — needed for status polling

// After the user has paid PIX, start phase processing
await vortex.startRamp(rampProcess.id);

// Then poll (see poll-ramp-status skill)
```

The SDK generates ephemeral keypairs, signs internal txs, and submits them in `registerRamp`. For BRL onramp the user wallet does NOT sign anything — there are no `unsignedTxs` for the user.

## REST fallback
```bash
# 1. Register
curl -X POST https://api.vortexfinance.co/v1/ramp/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $VORTEX_SECRET_KEY" \
  -d '{
    "quoteId": "QUOTE_ID",
    "ephemeralAccounts": [
      { "type": "EVM",       "address": "0x..." },
      { "type": "Substrate", "address": "5..."  },
      { "type": "Stellar",   "address": "G..."  }
    ],
    "additionalData": {
      "destinationAddress": "0xUserWalletAddress",
      "taxId": "12345678900"
    },
    "publicKey": "'"$VORTEX_PUBLIC_KEY"'"
  }'

# 2. Sign the returned `unsignedTxs` with the corresponding ephemeral keys (see AI_AGENT_INTEGRATION D.4)
#    and submit them via `/v1/ramp/update`.

# 3. Start
curl -X POST https://api.vortexfinance.co/v1/ramp/start \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $VORTEX_SECRET_KEY" \
  -d '{ "rampId": "RAMP_ID" }'
```

If you implement this without the SDK, follow the raw-API contract in [`AI_AGENT_INTEGRATION` § D.3–D.5](https://api-docs.vortexfinance.co/ai-agent-integration).

## Common failures
- `SubaccountNotFoundError` — the `taxId` has no KYC'd Vortex subaccount. Direct the user to KYC first.
- `KycInvalidError` — KYC exists but is not approved.
- `AmountExceedsLimitError` — quote amount above the user's KYC tier limit.
- `MissingBrlParametersError` — `destinationAddress` or `taxId` missing.
- `QuoteExpiredError` — re-quote and call `registerRamp` again.
- `TimeWindowExceededError` on `startRamp` — too long elapsed since `registerRamp`; restart the flow.

---

```yaml
---
name: start-offramp-brl
description: Initiate a crypto-to-BRL offramp paid out via PIX. End user signs on-chain transactions; PIX payout lands on the recipient's PIX key.
triggers:
  - "start offramp"
  - "sell crypto for BRL"
  - "USDC to PIX"
  - "PIX offramp"
  - "crypto to fiat Brazil"
---
```

## When to use
The user holds crypto on an EVM chain and wants to receive BRL via PIX. Unlike onramp, the user wallet must sign on-chain transactions.

## Prerequisites
- Fresh quote with `rampType: SELL`, `to: "pix"`, `outputCurrency: FiatToken.BRL`.
- `pixDestination` — recipient's PIX key (validate via `GET /v1/brla/validatePixKey` if uncertain).
- `receiverTaxId` — CPF/CNPJ of the PIX recipient.
- `taxId` — the user's KYC'd CPF/CNPJ.
- `walletAddress` — the user's source wallet address.

## SDK recipe
```js
const { rampProcess, unsignedTransactions } = await vortex.registerRamp(quote, {
  pixDestination: "user@example.com",
  receiverTaxId: "12345678900",
  taxId: "12345678900",
  walletAddress: "0xUserWalletAddress"
});

// Identify which txs the END USER must sign (vs. ephemerals, which SDK signed already)
const userTxs = await vortex.getUserTransactions(rampProcess, "0xUserWalletAddress");

// userTxs typically includes: SquidRouter approve, SquidRouter swap, AssetHub→Pendulum XCM
// Have the user sign each one and submit on-chain. Collect the resulting tx hashes.

await vortex.updateRamp(quote, rampProcess.id, {
  squidRouterApproveHash: "0xapprove...",
  squidRouterSwapHash:    "0xswap...",
  assethubToPendulumHash: undefined   // only present for AssetHub source
});

await vortex.startRamp(rampProcess.id);
// Then poll (see poll-ramp-status)
```

## REST fallback
Same three-step pattern: `POST /v1/ramp/register` → user signs → `POST /v1/ramp/update` with the collected hashes → `POST /v1/ramp/start`. See [`AI_AGENT_INTEGRATION` § D.3–D.5](https://api-docs.vortexfinance.co/ai-agent-integration) for the exact body shapes.

## Common failures
- `MissingBrlOfframpParametersError` — `receiverTaxId`, `pixDestination`, or `taxId` missing.
- `InvalidPixKeyError` — PIX key format invalid or unreachable. Validate beforehand with `GET /v1/brla/validatePixKey`.
- `InvalidPresignedTxsError` on `updateRamp` — hash format wrong, or the on-chain tx does not match the unsigned tx that was issued. Re-sign exactly what `getUserTransactions` returned.
- `NoPresignedTransactionsError` on `startRamp` — `updateRamp` was not called or did not include the required hashes.
- `RampNotUpdatableError` — ramp already started or terminal; restart from `createQuote`.

---

```yaml
---
name: poll-ramp-status
description: Track a ramp's progress through its phases until it reaches a terminal state.
triggers:
  - "check ramp status"
  - "is the ramp done"
  - "poll ramp"
  - "ramp phase"
  - "ramp progress"
---
```

## When to use
After `startRamp`, the ramp executes asynchronously through multiple phases. Poll until `currentPhase` is terminal (`complete`, `failed`, or `timedOut`).

## Prerequisites
- A `rampId` returned by `registerRamp`.

## SDK recipe
```js
const TERMINAL = new Set(["complete", "failed", "timedOut"]);

async function waitForCompletion(vortex, rampId, { intervalMs = 5000, maxMs = 30 * 60 * 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const r = await vortex.getRampStatus(rampId);
    if (TERMINAL.has(r.currentPhase)) return r;
    await new Promise(res => setTimeout(res, intervalMs));
  }
  throw new Error(`Ramp ${rampId} did not reach terminal phase within ${maxMs}ms`);
}

const finalState = await waitForCompletion(vortex, rampProcess.id);
if (finalState.currentPhase === "complete") {
  console.log("Done:", finalState.transactionHash);
} else {
  // See recover-from-errors skill
}
```

> **Prefer webhooks over polling** for production. See `register-and-verify-webhooks`. Polling is acceptable for sandbox testing and development.

## REST fallback
```bash
curl -H "X-API-Key: $VORTEX_SECRET_KEY" \
  https://api.vortexfinance.co/v1/ramp/RAMP_ID
```

## Common failures
- `RampNotFoundError` — wrong `rampId` or wrong environment (sandbox vs prod).
- Ramp stuck mid-phase for > 30 min → fetch error logs (`recover-from-errors`).

---

```yaml
---
name: setup-auth-and-partner
description: Configure Vortex API credentials correctly for server-side, browser, and sandbox environments.
triggers:
  - "set up API key"
  - "partner setup"
  - "configure auth"
  - "pk vs sk"
  - "sandbox vs production"
---
```

## When to use
First-time integration, environment migration, or when an agent needs to decide where each key may live.

## Key types
| Key | Where it goes | Purpose |
|-----|---------------|---------|
| `pk_live_*` / `pk_test_*` | Anywhere (browser-safe) | Partner attribution. Sent inside request bodies as `publicKey`. |
| `sk_live_*` / `sk_test_*` | Server-side only | API auth. Sent as `X-API-Key` header. **Never** ship to browser/mobile bundles. |

## SDK recipe
```js
import { VortexSdk } from "@vortexfi/sdk";

const vortex = new VortexSdk({
  apiBaseUrl: process.env.VORTEX_API_URL, // sandbox or prod
  publicKey:  process.env.VORTEX_PUBLIC_KEY,  // pk_*
  secretKey:  process.env.VORTEX_SECRET_KEY,  // sk_*  — server side only
  storeEphemeralKeys: true                    // writes ephemerals_<rampId>.json locally
});
```

For server processes that manage their own ephemeral key storage (e.g. HSM, encrypted DB), set `storeEphemeralKeys: false` and persist via your own mechanism.

## REST fallback
Every authenticated endpoint takes:
- Header: `X-API-Key: sk_<env>_<32chars>`
- Body field: `"publicKey": "pk_<env>_<...>"`

## Common failures
- `401 Unauthorized` — `X-API-Key` missing, malformed, or wrong environment.
- Mixing keys across environments (`sk_test_*` against prod URL) — always silently fails auth.
- Browser bundle accidentally including `sk_*` — rotate the key immediately if exposed.

---

```yaml
---
name: register-and-verify-webhooks
description: Subscribe to ramp lifecycle events and verify the signature on incoming webhook deliveries.
triggers:
  - "webhook"
  - "register webhook"
  - "verify webhook signature"
  - "TRANSACTION_CREATED"
  - "STATUS_CHANGE"
  - "ramp event notification"
---
```

## When to use
Production integrations should rely on webhooks rather than polling. Webhooks fire on two events: `TRANSACTION_CREATED` (ramp registered) and `STATUS_CHANGE` (phase transitioned to `PENDING`, `COMPLETE`, or `FAILED`).

## Prerequisites
- Public HTTPS endpoint to receive deliveries.
- A way to fetch and cache the Vortex RSA public key.
- Either a `quoteId` (per-ramp scope) or a `sessionId` (per-session scope), or neither (global to your partner key).

## SDK recipe
The SDK does **not** wrap webhook registration. Call REST directly.

## REST recipe (registration)
```bash
curl -X POST https://api.vortexfinance.co/v1/webhook \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $VORTEX_SECRET_KEY" \
  -d '{
    "url": "https://your-app.example.com/vortex/webhook",
    "quoteId": "QUOTE_ID",
    "events": ["TRANSACTION_CREATED", "STATUS_CHANGE"]
  }'

# Delete later:
curl -X DELETE https://api.vortexfinance.co/v1/webhook/WEBHOOK_ID \
  -H "X-API-Key: $VORTEX_SECRET_KEY"
```

## Signature verification (Node.js)
Vortex signs each delivery with **RSA-PSS + SHA-256** using a key whose public half is available at `GET /v1/public-key`. Headers on every delivery:
- `X-Vortex-Signature` — base64-encoded RSA-PSS signature over the raw request body.
- `X-Vortex-Timestamp` — Unix seconds; reject if outside ±300s window.

```js
import crypto from "node:crypto";

let cachedPubKey;
async function getPublicKey(apiBaseUrl) {
  if (cachedPubKey) return cachedPubKey;
  const res = await fetch(`${apiBaseUrl}/v1/public-key`);
  cachedPubKey = (await res.json()).publicKey; // PEM
  return cachedPubKey;
}

export async function verifyVortexWebhook(req, apiBaseUrl) {
  const sig = req.headers["x-vortex-signature"];
  const ts  = Number(req.headers["x-vortex-timestamp"]);
  if (!sig || !ts) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false; // replay window

  const pem = await getPublicKey(apiBaseUrl);
  return crypto.verify(
    "sha256",
    Buffer.from(req.rawBody),    // must be the unparsed body
    { key: pem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN },
    Buffer.from(sig, "base64")
  );
}
```

## Payload shape
```json
{
  "eventType": "STATUS_CHANGE",
  "timestamp": "2026-05-19T12:34:56.000Z",
  "payload": {
    "quoteId": "...",
    "sessionId": "...",
    "transactionId": "...",
    "transactionStatus": "PENDING | COMPLETE | FAILED",
    "transactionType": "onramp | offramp"
  }
}
```

## Delivery semantics
- Up to **5 retries** with backoff 1s → 2s → 4s → 8s → 16s.
- 30s timeout per attempt.
- After 5 consecutive failures the webhook is **auto-deactivated**; re-register to resume.

## Common failures
- Signature verification fails → ensure you verify over the **raw** body, not the parsed JSON. Express users: capture `req.rawBody` via `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })`.
- Public key changes after Vortex restart in dev → don't hardcode; fetch from `/v1/public-key` and cache short-term.
- Webhook stops firing → check if it auto-deactivated after 5 failures; re-register.

---

```yaml
---
name: discover-supported-corridors
description: Enumerate which fiat tokens, crypto tokens, networks, and payment methods Vortex currently supports.
triggers:
  - "supported tokens"
  - "supported currencies"
  - "which networks"
  - "supported countries"
  - "payment methods"
  - "supported corridors"
---
```

## When to use
Before quoting an unknown combination, or to power a UI dropdown of supported options.

## Live discovery endpoints (all public, no auth)
| Endpoint | Returns |
|----------|---------|
| `GET /v1/supported-fiat-currencies` | Enabled fiat tokens with name/decimals/flag |
| `GET /v1/supported-cryptocurrencies?network=<Networks>` | Crypto tokens (optionally filtered by network) |
| `GET /v1/supported-payment-methods?type=buy\|sell&fiat=<FiatToken>` | Payment methods (PIX, SEPA, CBU, ACH, SPEI, WIRE) with min/max |
| `GET /v1/supported-countries?fiatCurrency=<FiatToken>` | Countries with their fiats |

## SDK recipe
The SDK does not wrap these endpoints. Use `fetch` directly, or rely on the static enums (`FiatToken`, `EvmToken`, `Networks`, `EPaymentMethod`) exported from `@vortexfi/sdk` for compile-time lookups.

```js
const fiats = await fetch("https://api.vortexfinance.co/v1/supported-fiat-currencies").then(r => r.json());
const cryptos = await fetch("https://api.vortexfinance.co/v1/supported-cryptocurrencies?network=Polygon").then(r => r.json());
```

## No combined corridor endpoint
There is **no single `/v1/supported-corridors` endpoint**. To check whether a specific `(fiat, crypto, network, paymentMethod)` combination is supported, the recommended pattern is **quote-and-handle**:

```js
try {
  const quote = await vortex.createQuote({ /* candidate combination */ });
  // → corridor is live
} catch (err) {
  if (err.name === "InvalidNetworkError" || err.message.includes("not implemented")) {
    // → corridor not supported
  } else {
    throw err;
  }
}
```

## Current corridor reality (May 2026)
- **BRL via PIX**: onramp and offramp both live.
- **EUR via SEPA**: SDK types exist (`EurOnrampQuote`, `EurOfframpQuote`) but handlers throw `"Euro onramp/offramp handler not implemented yet"` at runtime. Treat as `planned`.
- **ARS via CBU**: supported via the AlfredPay corridor; route resolver determines availability per-combination.
- **USD / MXN / COP via ACH / SPEI / WIRE**: supported via the AlfredPay corridor; route resolver determines availability per-combination.

## Common failures
- Filtering by a fiat that has no payment methods → empty array, not an error.
- Hardcoding the corridor matrix on the client → goes stale. Re-fetch periodically or rely on quote errors as the source of truth.

---

```yaml
---
name: recover-from-errors
description: Handle ramp failures, fetch diagnostic error logs, retry safely, and decide when to escalate to Vortex support.
triggers:
  - "ramp failed"
  - "stuck phase"
  - "retry ramp"
  - "error recovery"
  - "getErrorLogs"
  - "what went wrong"
---
```

## When to use
A `getRampStatus` returns `currentPhase === "failed"`, the ramp is stuck on a non-terminal phase beyond expected time, or any SDK call throws an unexpected error class.

## Diagnostic call: error logs
```js
// SDK does not wrap this endpoint — use REST
const errors = await fetch(`https://api.vortexfinance.co/v1/ramp/${rampId}/errors`, {
  headers: { "X-API-Key": process.env.VORTEX_SECRET_KEY }
}).then(r => r.json());
```

```bash
curl -H "X-API-Key: $VORTEX_SECRET_KEY" \
  https://api.vortexfinance.co/v1/ramp/RAMP_ID/errors
```

Include this payload (with secrets redacted) in any support ticket.

## Error → action mapping
| SDK Error class | Likely cause | Recommended action |
|---|---|---|
| `QuoteExpiredError` | TTL exceeded between quote and register | Call `createQuote` again with the same params |
| `QuoteNotFoundError` | Wrong env or stale id | Verify base URL; re-quote |
| `InvalidNetworkError` | Network not in `Networks` enum | Use `discover-supported-corridors` |
| `MissingRequiredFieldsError` / `MissingBrlParametersError` / `MissingBrlOfframpParametersError` | Body field missing | Fill the missing field; do not retry blindly |
| `SubaccountNotFoundError` / `KycInvalidError` | KYC issue | Direct user through KYC; do not retry programmatically |
| `AmountExceedsLimitError` | Above KYC tier | Lower amount or upgrade KYC |
| `InvalidPixKeyError` | Bad recipient PIX key | Validate via `GET /v1/brla/validatePixKey`, then re-register |
| `InvalidPresignedTxsError` | Submitted signed tx does not match the issued unsigned tx (chainId, nonce, gas, recipient, or value mismatch) | Re-sign exactly what `getUserTransactions` returned; do not reuse old signatures |
| `NoPresignedTransactionsError` | `startRamp` called before `updateRamp` | Submit the required hashes via `updateRamp` first |
| `TimeWindowExceededError` | Too long between `registerRamp` and `startRamp` | Restart the flow from `createQuote` |
| `RampNotFoundError` | Wrong id or wrong env | Re-check `rampId` and base URL |
| `RampNotUpdatableError` | Ramp already in a terminal or running phase | Start a new ramp from a fresh quote |
| `NetworkError` / `APIConnectionError` | Transient HTTP failure | Retry with exponential backoff (max 3 attempts) |
| `APIResponseError` (5xx) | Vortex-side issue | Retry with backoff; if persistent, contact support with the `rampId` and error logs |

## Retry-safe vs. not retry-safe
| Step | Safe to retry? |
|---|---|
| `createQuote` | Yes — idempotent |
| `getQuote` / `getRampStatus` | Yes — read-only |
| `registerRamp` | **No** — generates new ephemerals each time. Retrying creates a parallel ramp. Restart from quote only if the previous attempt failed cleanly. |
| `updateRamp` | Yes — same hashes are accepted again |
| `startRamp` | Yes — idempotent (later calls are no-ops once started) |

## Sandbox testing
Switch `apiBaseUrl` to the sandbox URL and use `pk_test_*` / `sk_test_*` keys. The sandbox accepts test PIX payments and exposes the same endpoints. See AI_AGENT_INTEGRATION § G for the production-readiness checklist.

## When to escalate
Contact Vortex support if:
- Ramp is stuck > 30 min on a non-terminal phase.
- `getErrorLogs` shows the same error repeating across attempts.
- A `complete` ramp shows no `transactionHash` after 10 minutes.

Always include: `rampId`, environment (sandbox/prod), partner `publicKey`, redacted error logs, and the `transactionHash` if present. **Never** include `sk_*` keys in support communications.
