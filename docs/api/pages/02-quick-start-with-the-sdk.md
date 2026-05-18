# 2. Quick Start With The SDK

This page walks through a complete BRL ramp end-to-end using `@vortexfi/sdk`. The SDK is for trusted Node.js environments only.

## Install

```bash
npm install @vortexfi/sdk
# or
bun add @vortexfi/sdk
```

## Initialize

```ts
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

```ts
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

```ts
const quote = await sdk.createQuote({
  rampType: RampDirection.SELL,
  from: Networks.Polygon,
  to: "pix",
  inputAmount: "100",            // 100 USDC
  inputCurrency: EvmToken.USDC,
  outputCurrency: FiatToken.BRL
});

const { rampProcess, userTransactions } = await sdk.registerRamp(quote, {
  userAddress: "0xUSER...",
  pixKey: "user@example.com",
  taxId: "12345678900"
});

// userTransactions contains the transactions the SDK could not sign on the
// user's behalf. Route them to the user's wallet (see below).
```

### Signing The User Transaction With Wagmi

The user-owned transactions are EVM typed-data payloads. With wagmi:

```ts
import { signTypedData, sendTransaction } from "@wagmi/core";

for (const tx of userTransactions) {
  if (tx.type === "evm-typed-data") {
    const signature = await signTypedData(wagmiConfig, tx.payload);
    await sdk.submitUserSignature(rampProcess.id, tx.id, signature);
  } else if (tx.type === "evm-transaction") {
    const hash = await sendTransaction(wagmiConfig, tx.payload);
    await sdk.submitUserTxHash(rampProcess.id, tx.id, hash);
  }
}

const started = await sdk.startRamp(rampProcess.id);
```

Validate every field before signing: `chainId`, `verifyingContract`, `value`, `to`, and `data` must match what your application requested. Never sign payloads blindly.

## Tracking Status

Poll for user-facing screens, use webhooks for back-office reconciliation:

```ts
const status = await sdk.getRampStatus(rampProcess.id);
```

See [7. Webhooks](./07-webhooks.md).

## Updating A Ramp

Most updates happen inside the SDK. For BRL buys, `registerRamp` already submits the presigned ephemeral transactions via `POST /v1/ramp/update` before returning. You typically only call `submitUserSignature` / `submitUserTxHash` explicitly for offramp user transactions, then `startRamp`.

## Why The SDK Is Preferred

The SDK creates fresh ephemeral accounts per ramp, signs the transactions Vortex returns, submits ramp updates, and can persist a local backup of ephemeral secrets. This removes the most error-prone parts of a custom integration.

If you disable SDK key storage with `storeEphemeralKeys: false`, your application must provide an equivalent secure backup. The default backup is an **unencrypted** JSON file named `ephemerals_{rampId}.json` written to the Node process's current working directory. Treat it as sensitive key material; encrypt it, restrict the directory, or disable storage and implement your own store. See [5. Ephemeral Key Custody](./05-ephemeral-key-custody.md).

---
