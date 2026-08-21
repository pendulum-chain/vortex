# Quick Start With The SDK

This page walks through complete BRL and bank-transfer-corridor (USD, MXN, COP, ARS) ramps end-to-end using `@vortexfi/sdk` in Node.js or a modern browser.

## Install

```bash
npm install @vortexfi/sdk
# or
bun add @vortexfi/sdk
```

## Initialize In Node.js

```js
import {
  VortexSdk,
  FiatToken,
  EvmToken,
  Networks,
  RampDirection
} from "@vortexfi/sdk";
import type { VortexSdkConfig } from "@vortexfi/sdk";

const config: VortexSdkConfig = {
  apiBaseUrl: "https://api.vortexfinance.co",
  publicKey: "pk_live_...",
  secretKey: "sk_live_...",
  storeEphemeralKeys: true
};

const sdk = new VortexSdk(config);
```

`publicKey` is sent as `X-Public-Key` (and retained in quote bodies for compatibility) for attribution, approved low-sensitivity reads, and discount eligibility. `secretKey` is sent as `X-API-Key` and must only be used server-side. Both values should come from the same API credential; a mixed pair returns `403 CREDENTIAL_MISMATCH`. A valid secret may be used without a public value.

## Initialize In A Browser

Browser integrations use the user's renewable Supabase session and never configure `secretKey`:

```js
const sdk = new VortexSdk({
  apiBaseUrl: "https://api.vortexfinance.co",
  publicKey: "pk_live_...",
  accessTokenProvider: async () => getCurrentSession()?.accessToken
});
```

The configured browser origin must be present in the API deployment's `BROWSER_SDK_ORIGINS` allowlist. The browser build rejects `secretKey` at construction.

You can check the authenticated subject's sanitized corridor readiness without exposing exact limits or profile data:

```js
const info = await sdk.getRampInfo();
console.log(info.corridors.BR?.kycStatus, info.corridors.BR?.canBuy);
```

Constructing `VortexSdk` does not open chain WebSockets. Required connections are initialized lazily when returned transactions need them. Reuse one instance per active integration flow.

## BRL Onramp (Buy)

```js
const quote = await sdk.createQuote({
  rampType: RampDirection.BUY,
  from: "pix",
  to: Networks.Polygon,
  inputAmount: "150",            // 150 BRL
  inputCurrency: FiatToken.BRL,
  outputCurrency: EvmToken.USDC
});

const { rampProcess } = await sdk.registerRamp(quote, {
  destinationAddress: "0x1234567890123456789012345678901234567890"
});

// Show the PIX QR to the user and wait for them to pay.
console.log(rampProcess.depositQrCode);

// After the user completes the PIX payment, start the ramp.
const started = await sdk.startRamp(rampProcess.id);
```

The user must have completed BRL KYC level 1 or higher, and the SDK's credential must be bound to that profile. The user's CPF/CNPJ is derived from the authenticated account. The `taxId` field is deprecated — if you still send it, it must match the tax ID on the account or registration is rejected. A technical profile without the user's eligible provider account cannot drive KYC or register the user's ramp; onboard or provision the real subject first.

## BRL Offramp (Sell)

Selling crypto for BRL requires the user to sign one transaction with their own wallet. The SDK returns those transactions for you to route to the user's wallet provider.

```js
const quote = await sdk.createQuote({
  rampType: RampDirection.SELL,
  from: Networks.Polygon,
  to: "pix",
  inputAmount: "100",            // 100 USDC
  inputCurrency: EvmToken.USDC,
  outputCurrency: FiatToken.BRL
});

const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, {
  pixDestination: "user@example.com",
  walletAddress: "0xUSER..."
});

// unsignedTransactions contains the transactions the SDK could not sign on the
// user's behalf. Route them to the user's wallet (see below).
```

The PIX payout goes to `pixDestination`, which must belong to the user. To pay out to a different recipient, pass `receiverTaxId` with the recipient's CPF/CNPJ; it defaults to the user's own tax ID.

### Signing The User Transaction With Wagmi

The user-owned transactions are EVM typed-data payloads or EVM transactions. Keep wallet prompts in your application and let the SDK handle classification and submission:

```js
import { signTypedData, sendTransaction } from "@wagmi/core";

await sdk.submitUserTransactions(rampProcess.id, unsignedTransactions, {
  signTypedData: payload => signTypedData(wagmiConfig, payload),
  sendTransaction: tx => sendTransaction(wagmiConfig, tx)
});

const started = await sdk.startRamp(rampProcess.id);
```

Validate every field before signing: `chainId`, `verifyingContract`, `value`, `to`, and `data` must match what your application requested. Never sign payloads blindly.

## USD, MXN, COP And ARS Ramps

USD, MXN, COP, and ARS settle through Vortex's local payment partners over the user's domestic banking rail. Pass the rail identifier as `from` (buy) or `to` (sell):

| Fiat currency | Rail identifier | Payment rail |
|---|---|---|
| `USD` | `"ach"` | ACH bank transfer |
| `MXN` | `"spei"` | SPEI transfer |
| `COP` | `"ach"` | Colombian bank transfer |
| `ARS` | `"cbu"` | CBU bank transfer |

All four corridors support buys and sells on EVM networks; AssetHub is not available for these corridors. The examples below use MXN — for the other currencies, substitute the fiat token and the rail identifier from the table. See [Fiat Corridors](https://api-docs.vortexfinance.co/fiat-corridors) for onboarding, fiat accounts, and limits.

### Onramp (Buy)

The user pays fiat off-chain; crypto is delivered to `destinationAddress` on the quoted network.

```js
import { EPaymentMethod } from "@vortexfi/sdk";

const quote = await sdk.createQuote({
  rampType: RampDirection.BUY,
  from: EPaymentMethod.SPEI,
  to: Networks.Polygon,
  network: Networks.Polygon,
  inputAmount: "201",            // 201 MXN
  inputCurrency: FiatToken.MXN,
  outputCurrency: EvmToken.USDC
});

const { rampProcess } = await sdk.registerRamp(quote, {
  destinationAddress: "0x1234567890123456789012345678901234567890",
  walletAddress: "0x1234567890123456789012345678901234567890"
  // fiatAccountId is optional for onramp
});

const started = await sdk.startRamp(rampProcess.id);

// Show the user how to pay via SPEI
console.log(started.achPaymentData);
```

No user-signed on-chain transactions are required for onramp. The SDK signs ephemeral transactions during `registerRamp`.

Quotes can be requested without any key (anonymous rate discovery). Registering through the SDK requires either a configured `secretKey` or an `accessTokenProvider` returning the current Supabase Bearer session to resolve to an onboarded profile. The same profile must have completed KYC for the corridor's country, so registration resolves to its verified payment profile automatically. A `publicKey`-only registration is rejected. Never expose an `sk_*` in browser code.

The SDK cannot mint credentials or run KYC. Onboard the real user through the Vortex app or Widget, or use Vortex's managed-profile workflow, then use a credential bound to that profile. The secret is shown only once at creation; see [Authentication And API Credentials](https://api-docs.vortexfinance.co/authentication-and-partner-keys). This applies to buys and sells in all four corridors.

### Offramp (Sell)

Selling crypto for fiat in these corridors requires the user to sign one or more on-chain transactions with their own wallet. The SDK returns those transactions in `unsignedTransactions`.

```js
const quote = await sdk.createQuote({
  rampType: RampDirection.SELL,
  from: Networks.Polygon,
  to: EPaymentMethod.SPEI,
  network: Networks.Polygon,
  inputAmount: "10",             // 10 USDC
  inputCurrency: EvmToken.USDC,
  outputCurrency: FiatToken.MXN
});

const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, {
  fiatAccountId: "00000000-0000-0000-0000-000000000000", // user's fiat account
  walletAddress: "0xUSER..."
});
```

`fiatAccountId` is opaque to the SDK. Create or look up the user's fiat account out-of-band and pass the ID here. It is required for offramp and optional for onramp.

### Signing Offramp User Transactions

Use the SDK helper to classify, sign, broadcast, and submit each entry in `unsignedTransactions`:

```js
import { signTypedData, sendTransaction } from "@wagmi/core";

await sdk.submitUserTransactions(rampProcess.id, unsignedTransactions, {
  signTypedData: payload => signTypedData(wagmiConfig, payload),
  sendTransaction: tx => sendTransaction(wagmiConfig, tx)
});

await sdk.startRamp(rampProcess.id);
```

For wallets that call `eth_signTypedData_v4` directly, set `includeDomainType: true` on `submitUserTransactions` or pass `{ includeDomainType: true }` to `getTypedDataToSign` when using the lower-level helpers.

## Tracking Status

Poll for user-facing screens, use webhooks for back-office reconciliation:

```js
const status = await sdk.getRampStatus(rampProcess.id);
```

See [Webhooks](https://api-docs.vortexfinance.co/webhooks).

## Updating A Ramp

Most updates happen inside the SDK. For BRL buys, `registerRamp` already submits the presigned ephemeral transactions via `POST /v1/ramp/update` before returning. You typically only call `submitUserSignature` / `submitUserTxHash` explicitly for offramp user transactions, then `startRamp`.

## Why The SDK Is Preferred

The SDK creates fresh ephemeral accounts per ramp, signs the transactions Vortex returns, submits ramp updates, and can persist a local backup of ephemeral secrets. This removes the most error-prone parts of a custom integration.

The default backup is **unencrypted**: Node.js writes `ephemerals_{rampId}.json` in the current working directory, while browsers write that key to same-origin localStorage. Treat either as sensitive key material. Browser storage is prototype-grade and readable by every script on the origin. Setting `storeEphemeralKeys: false` disables the SDK backup entirely. See [Ephemeral Key Custody](https://api-docs.vortexfinance.co/ephemeral-key-custody).

For quote request races, browser token refresh, wallet-network checks, resumable payment screens, and safe polling, see [Custom UI Integration](https://api-docs.vortexfinance.co/custom-ui-integration).

---
