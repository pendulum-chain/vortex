# Quick Start With The SDK

This page walks through complete BRL and bank-transfer-corridor (USD, MXN, COP, ARS) ramps end-to-end using `@vortexfi/sdk`. The SDK is for trusted Node.js environments only.

## Install

```bash
npm install @vortexfi/sdk
# or
bun add @vortexfi/sdk
```

## Initialize

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

`publicKey` is attached to quote requests for partner attribution and discount eligibility. `secretKey` is sent as the `X-API-Key` header on authenticated requests and must only be used server-side.

Constructing `VortexSdk` opens three WebSocket connections (Pendulum, Moonbeam, Hydration). Reuse one instance per process; do not construct a new SDK per request.

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
  destinationAddress: "0x1234567890123456789012345678901234567890",
  taxId: "12345678900"           // user's CPF
});

// Show the PIX QR to the user and wait for them to pay.
console.log(rampProcess.depositQrCode);

// After the user completes the PIX payment, start the ramp.
const started = await sdk.startRamp(rampProcess.id);
```

The user must have completed BRLA KYC level 1 or higher under the same `taxId`. Partner `sk_*` keys cannot drive BRLA KYC; onboard the user through the Vortex app or Widget first.

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
  receiverTaxId: "12345678900",
  taxId: "12345678900",
  walletAddress: "0xUSER..."
});

// unsignedTransactions contains the transactions the SDK could not sign on the
// user's behalf. Route them to the user's wallet (see below).
```

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

All four corridors support buys and sells on EVM networks; AssetHub is not available for these corridors. The examples below use MXN — for the other currencies, substitute the fiat token and the rail identifier from the table. See [Bank Transfer Corridors](https://api-docs.vortexfinance.co/bank-transfer-corridors) for onboarding, fiat accounts, and limits.

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

Quotes can be requested without any key (anonymous rate discovery). Registering the ramp requires the user to be onboarded first: authenticate the SDK with that user's own **user-linked** `secretKey` (the `sk_*` key created by that user), and the same user must have completed KYC for the corridor's country. The key and the KYC record belong to the same account, so registration resolves to the user's verified payment profile automatically. A `publicKey`-only registration, or a partner-scoped `sk_*` with no user, is rejected.

Partner `sk_*` keys cannot drive this KYC, and the SDK cannot mint keys or run KYC — onboard the user through the Vortex app or Widget first, then use their `sk_*` key (shown only once, at creation; see [User API Keys](https://api-docs.vortexfinance.co/user-api-keys) for minting it programmatically). This applies to buys and sells in all four corridors.

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

If you disable SDK key storage with `storeEphemeralKeys: false`, your application must provide an equivalent secure backup. The default backup is an **unencrypted** JSON file named `ephemerals_{rampId}.json` written to the Node process's current working directory. Treat it as sensitive key material; encrypt it, restrict the directory, or disable storage and implement your own store. See [Ephemeral Key Custody](https://api-docs.vortexfinance.co/ephemeral-key-custody).

---
