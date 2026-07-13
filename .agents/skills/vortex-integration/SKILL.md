---
name: vortex-integration
description: Use when integrating Vortex or @vortexfi/sdk, including quotes, onramps/offramps for BRL (PIX), EUR (SEPA), USD (ACH), MXN (SPEI), COP, and ARS (CBU), ramp register/update/start/status flows, webhook verification, ephemeral key custody, supported corridors, sandbox/production auth, and recovery from ramp errors.
---

# Vortex Integration Skill

A machine-loadable capability catalog for AI coding agents integrating Vortex into third-party applications. Start by reading **Global Context**, then match the user's task to the closest recipe below before implementing. Each recipe includes trigger phrases plus a minimal SDK and/or REST form.

> **Companion document**: [AI Agent Integration](https://api-docs.vortexfinance.co/ai-agent-integration) covers the raw-API contract, mandatory client responsibilities, and language-agnostic guidance. This skill focuses on **task-shaped recipes** an agent can match against user intent.

---

## Global Context (read once)

- **SDK**: `@vortexfi/sdk` (JavaScript/TypeScript). Install: `npm i @vortexfi/sdk`.
- **API base URLs**: production `https://api.vortexfinance.co`, sandbox `https://api-sandbox.vortexfinance.co`.
- **Auth keys**: partner integrations use a key pair.
  - `pk_live_*` / `pk_test_*` — public key, sent in request bodies for partner attribution.
  - `sk_live_*` / `sk_test_*` — secret key, sent in the `X-API-Key` header. **Never expose `sk_*` in a browser or mobile app.**
  - **Ramp registration requires a user-linked `sk_*` key in every corridor** — the register call is rejected unless the authenticated key resolves to a user account. KYC identity (BRL tax ID, Alfredpay customer, Mykobo customer) is derived from that account, never from request fields.
- **Decimals**: all amounts are strings. Never parse them through JS `Number` — use `BigInt`, `decimal.js`, or equivalent.
- **Quote TTL**: quotes expire (see `expiresAt`). Re-quote, never reuse stale quotes.
- **Ramp counts**: ephemeral keys sign exactly 5 presigned transactions per ramp. The API rejects anything else.
- **Currently implemented corridors** (all live in the SDK): BRL via PIX, EUR via SEPA (Mykobo), USD via ACH, MXN via SPEI, COP via ACH, ARS via CBU. All support both onramp (BUY) and offramp (SELL). EUR and the bank-transfer corridors deliver to EVM networks only (no AssetHub).
- **EUR enum value**: EUR quotes use `FiatToken.EURC` (not `EUR`) as the currency value, with `"sepa"` as the rail identifier.
- **taxId is deprecated for BRL**: the user's tax ID is derived server-side from the user-linked `sk_*` key. Sending a `taxId` that mismatches the derived one is rejected; stop sending it in new integrations.
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
The user is in Brazil (or has BRL/PIX access) and wants to buy crypto. KYC must be completed beforehand through the Vortex app or Widget; the user's CPF/CNPJ is resolved server-side from their user-linked `sk_*` key.

## Prerequisites
- Fresh quote with `rampType: BUY`, `from: "pix"`, `inputCurrency: FiatToken.BRL`.
- `destinationAddress` — the user's wallet on the target network.
- The user has completed BRL KYC; `taxId` is **deprecated** — it is derived from the authenticated key, and a mismatching value is rejected.

## SDK recipe
```js
const { rampProcess } = await vortex.registerRamp(quote, {
  destinationAddress: "0xUserWalletAddress"
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
# 1. Register. signingAccounts holds the PUBLIC addresses of the ephemerals you
#    generated for this ramp: one Substrate and one EVM account (the only two
#    account types the API accepts). Partner attribution is carried by the quote's
#    apiKey, so register takes no publicKey field.
curl -X POST https://api.vortexfinance.co/v1/ramp/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $VORTEX_SECRET_KEY" \
  -d '{
    "quoteId": "QUOTE_ID",
    "signingAccounts": [
      { "type": "Substrate", "address": "5..."  },
      { "type": "EVM",       "address": "0x..." }
    ],
    "additionalData": {
      "destinationAddress": "0xUserWalletAddress"
    }
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
- `SubaccountNotFoundError` — the tax ID derived from the authenticated key has no KYC'd Vortex subaccount. Direct the user to KYC first.
- `KycInvalidError` — KYC exists but is not approved.
- `AmountExceedsLimitError` — quote amount above the user's KYC tier limit.
- Missing `destinationAddress` → `400 "Parameter destinationAddress is required for onramp"`. (The SDK's `MissingBrlParametersError` maps only the legacy `"...destinationAddress and taxId..."` message and will not fire for this; treat the raw 400 message as authoritative.)
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
- `walletAddress` — the user's source wallet address.
- Optional: `receiverTaxId` — CPF/CNPJ of the PIX recipient when paying out to someone other than the user. `taxId` is **deprecated** (derived from the authenticated key).

## SDK recipe
```js
const { rampProcess, unsignedTransactions } = await vortex.registerRamp(quote, {
  pixDestination: "user@example.com",
  walletAddress: "0xUserWalletAddress"
});

// Easiest path: let the SDK classify, sign, broadcast, and submit the user-owned txs
// via your wallet callbacks (e.g. @wagmi/core):
await vortex.submitUserTransactions(rampProcess.id, unsignedTransactions, {
  signTypedData: payload => signTypedData(wagmiConfig, payload),
  sendTransaction: tx => sendTransaction(wagmiConfig, tx)
});

// Lower-level alternative: filter the user txs yourself, have the user sign and
// broadcast them, then push the hashes back:
const userTxs = await vortex.getUserTransactions(rampProcess, "0xUserWalletAddress");
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
- Missing `pixDestination` → `400 "pixDestination is required for offramp to BRL"`. Missing `walletAddress` → `400 "User address must be provided for offramping."` (The SDK's `MissingBrlOfframpParametersError` maps only the legacy `"receiverTaxId, pixDestination and taxId..."` message and will not fire for these; treat the raw 400 message as authoritative.)
- `InvalidPixKeyError` — PIX key format invalid or unreachable. Validate beforehand with `GET /v1/brla/validatePixKey`.
- `InvalidPresignedTxsError` on `updateRamp` — hash format wrong, or the on-chain tx does not match the unsigned tx that was issued. Re-sign exactly what `getUserTransactions` returned.
- `NoPresignedTransactionsError` on `startRamp` — `updateRamp` was not called or did not include the required hashes.
- `RampNotUpdatableError` — ramp already started or terminal; restart from `createQuote`.

---

```yaml
---
name: start-ramp-eur-sepa
description: Initiate a EUR onramp or offramp via SEPA. Onramp shows IBAN transfer instructions; offramp requires user-signed on-chain transactions.
triggers:
  - "EUR onramp"
  - "EUR offramp"
  - "SEPA"
  - "buy crypto with euro"
  - "sell crypto for euro"
  - "IBAN payment"
---
```

## When to use
The user has a SEPA bank account and wants to buy or sell crypto for EUR. EUR onboarding is individual KYC only and requires a connected wallet; complete it through the Vortex app or Widget first. EUR delivers to EVM networks only (no AssetHub).

## Prerequisites
- Quote with `inputCurrency: FiatToken.EURC` and `from: "sepa"` (buy), or `outputCurrency: FiatToken.EURC` and `to: "sepa"` (sell). Note: the enum value is `EURC`, not `EUR`.
- `destinationAddress`, `email`, `ipAddress` — required for both directions.
- `walletAddress` — additionally required for offramp (the user's source wallet).

## SDK recipe (onramp)
```js
const quote = await vortex.createQuote({
  rampType: RampDirection.BUY,
  from: EPaymentMethod.SEPA,
  to: Networks.Base,
  network: Networks.Base,
  inputAmount: "100",
  inputCurrency: FiatToken.EURC,
  outputCurrency: EvmToken.USDC
});

const { rampProcess } = await vortex.registerRamp(quote, {
  destinationAddress: "0xUserWalletAddress",
  email: "user@example.com",
  ipAddress: "203.0.113.1"
});

// SEPA transfer instructions are on the ramp after registration:
console.log(rampProcess.ibanPaymentData.iban);
console.log(rampProcess.ibanPaymentData.receiverName);
console.log(rampProcess.ibanPaymentData.reference);

// After the user completed the SEPA transfer:
await vortex.startRamp(rampProcess.id);
```

No user-signed on-chain transactions are required for EUR onramps.

## SDK recipe (offramp)
```js
const { rampProcess, unsignedTransactions } = await vortex.registerRamp(quote, {
  destinationAddress: "0xUserWalletAddress",
  email: "user@example.com",
  ipAddress: "203.0.113.1",
  walletAddress: "0xUserWalletAddress"
});

// User signs and broadcasts squidRouterApprove + squidRouterSwap, then:
await vortex.updateRamp(quote, rampProcess.id, {
  squidRouterApproveHash: "0xapprove...",
  squidRouterSwapHash: "0xswap..."
});
await vortex.startRamp(rampProcess.id);
```

`submitUserTransactions` (see `start-offramp-brl`) works here as well.

## Common failures
- `MissingMykoboOnrampParametersError` / `MissingMykoboOfframpParametersError` — `destinationAddress`, `email`, `ipAddress`, or `walletAddress` missing.
- `MykoboKycRequiredError` — the user has not completed EUR KYC; onboard via the Vortex app or Widget.
- `503` "EUR ramps are currently disabled" on **register** — EUR is feature-gated server-side. EURC quotes still succeed while the gate is on, so a successful quote does not prove the corridor is enabled; probe registration in sandbox before shipping.

---

```yaml
---
name: start-ramp-bank-transfer
description: Initiate an onramp or offramp for USD (ACH), MXN (SPEI), COP (ACH), or ARS (CBU) through Vortex's local payment partners.
triggers:
  - "USD onramp"
  - "MXN onramp"
  - "COP offramp"
  - "ARS ramp"
  - "SPEI"
  - "ACH"
  - "CBU"
  - "bank transfer ramp"
---
```

## When to use
The user wants to ramp USD, MXN, COP, or ARS over their domestic banking rail. These corridors **require a user-linked `sk_*` key**: registration resolves the user's KYC and payment profile from the authenticated account. Partner-scoped keys cannot register ramps here. EVM networks only (no AssetHub).

| Fiat | Rail identifier | Payment rail |
|------|-----------------|--------------|
| `USD` | `"ach"` | ACH bank transfer |
| `MXN` | `"spei"` | SPEI transfer |
| `COP` | `"ach"` | Colombian bank transfer |
| `ARS` | `"cbu"` | CBU bank transfer |

## Prerequisites
- The user completed KYC for the corridor's country via the Vortex app or Widget, and the SDK is authenticated with that user's own `sk_*` key.
- Buy: `destinationAddress` (required); `fiatAccountId`, `walletAddress` optional.
- Sell: `fiatAccountId` and `walletAddress` (both required). List saved accounts with `vortex.listAlfredpayFiatAccounts(country)`.

## SDK recipe (onramp, MXN shown — substitute fiat + rail for USD/COP/ARS)
```js
const quote = await vortex.createQuote({
  rampType: RampDirection.BUY,
  from: EPaymentMethod.SPEI,
  to: Networks.Polygon,
  network: Networks.Polygon,
  inputAmount: "201",
  inputCurrency: FiatToken.MXN,
  outputCurrency: EvmToken.USDC
});

const { rampProcess } = await vortex.registerRamp(quote, {
  destinationAddress: "0xUserWalletAddress"
});

const started = await vortex.startRamp(rampProcess.id);

// Bank transfer instructions the user must pay are on the START response:
console.log(started.achPaymentData);
```

No user-signed on-chain transactions on buys. Unlike BRL there is no QR code — display the `achPaymentData` deposit instructions verbatim; the ramp continues automatically once the fiat deposit is confirmed.

## SDK recipe (offramp)
```js
const accounts = await vortex.listAlfredpayFiatAccounts("MEX");

const { rampProcess, unsignedTransactions } = await vortex.registerRamp(quote, {
  fiatAccountId: accounts[0].id,
  walletAddress: "0xUserWalletAddress"
});

await vortex.submitUserTransactions(rampProcess.id, unsignedTransactions, {
  signTypedData: payload => signTypedData(wagmiConfig, payload),
  sendTransaction: tx => sendTransaction(wagmiConfig, tx)
});
await vortex.startRamp(rampProcess.id);
```

The SDK cannot **create** fiat accounts; they are created during onboarding in the Vortex app or Widget. `fiatAccountId` is opaque to the SDK.

## Common failures
- `MissingAlfredpayOnrampParametersError` / `MissingAlfredpayOfframpParametersError` — `destinationAddress`, `fiatAccountId`, or `walletAddress` missing.
- `AlfredpayOnrampKycRequiredError` — the authenticated user has no approved KYC for the corridor's country.
- `400` "requires an API key linked to a user" on register — the `sk_*` key is partner-scoped, not user-linked. Mint a user key after email OTP sign-in.
- `InsufficientBalanceError` — the offramp pre-flight found the source wallet balance below the quote's input amount.

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
| `sk_live_*` / `sk_test_*` (partner-scoped) | Server-side only | Webhook management and partner attribution. Sent as `X-API-Key` header. **Cannot register ramps** unless the key is also linked to a user. **Never** ship to browser/mobile bundles. |
| `sk_live_*` / `sk_test_*` (user-linked) | Server-side only | Required for ramp registration in every corridor; corridor identity (BRL taxId, Alfredpay/Mykobo customer) is derived from the linked account. Minted programmatically after email OTP sign-in; shown once at creation. |

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
    "transactionType": "BUY | SELL"
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
  if (err.name === "InvalidNetworkError" || err.name === "MissingRequiredFieldsError") {
    // → corridor not supported
  } else {
    throw err;
  }
}
```

## Current corridor reality (July 2026)
- **BRL via PIX**: onramp and offramp both live. `taxId` deprecated — derived from the user-linked key.
- **EUR via SEPA (Mykobo)**: onramp and offramp fully implemented in the SDK (`FiatToken.EURC`, rail `"sepa"`), but registration is feature-gated server-side and currently returns `503` "EUR ramps are currently disabled" when the gate is on. Quotes succeed regardless — probe registration, not quoting.
- **USD (ACH) / MXN (SPEI) / COP (ACH) / ARS (CBU)**: onramp and offramp live via the AlfredPay corridor; requires a user-linked `sk_*` key. Route resolver determines availability per-combination.
- All corridors deliver to EVM networks; AssetHub is only available for BRL routes.

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
| `SubaccountNotFoundError` / `KycInvalidError` | BRL KYC issue | Direct user through KYC; do not retry programmatically |
| `MykoboKycRequiredError` / `AlfredpayOnrampKycRequiredError` | EUR / bank-transfer-corridor KYC issue | Onboard the user via the Vortex app or Widget; do not retry programmatically |
| `AmountExceedsLimitError` | Above KYC tier | Lower amount or upgrade KYC |
| `InsufficientBalanceError` | Offramp pre-flight: source wallet balance below the quoted input | Top up the wallet or lower the amount, then re-register from a fresh quote |
| `EphemeralNotFreshError` / `EphemeralFreshnessCheckError` | Generated ephemeral account was not fresh, or freshness could not be verified | Safe to retry `registerRamp` — the SDK generates new ephemerals each attempt |
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
