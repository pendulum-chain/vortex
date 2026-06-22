# Vortex SDK

A stateless SDK that abstracts Vortex's API and ephemeral key handling for cross-chain ramp operations.

## Environment Support

This SDK is currently working only on **Node.js** environment.

## Installation

```bash
npm install @vortexfi/sdk
```

## Quick Start

```typescript
import { VortexSdk, FiatToken, EvmToken, Networks, RampDirection } from "@vortexfi/sdk";
import type { VortexSdkConfig } from "@vortexfi/sdk";

const config: VortexSdkConfig = {
  apiBaseUrl: "http://localhost:3000",
};

const sdk = new VortexSdk(config);

const quoteRequest = {
  from: "pix" as const,
  inputAmount: "150000",
  inputCurrency: FiatToken.BRL,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Polygon,
};

const quote = await sdk.createQuote(quoteRequest);

const brlOnrampData = {
  destinationAddress: "0x1234567890123456789012345678901234567890",
  taxId: "123.456.789-00"
};

const { rampProcess } = await sdk.registerRamp(quote, brlOnrampData);

// Make the FIAT payment.
// The sdk will provide the information to make the payment.
const { depositQrCode } = rampProcess;
console.log("Please do the pix transfer using the following code: ", depositQrCode);

// Once the payment is done, start the ramp.
const startedRamp = await sdk.startRamp(rampProcess.id);
```

### Alfredpay (USD / MXN / COP / ARS) onramp

```typescript
import { VortexSdk, FiatToken, EvmToken, EPaymentMethod, Networks, RampDirection } from "@vortexfi/sdk";

const sdk = new VortexSdk({ apiBaseUrl: "http://localhost:3000" });

const quote = await sdk.createQuote({
  from: EPaymentMethod.ACH, // USD and COP settle via ACH; MXN uses EPaymentMethod.SPEI
  inputAmount: "100",
  inputCurrency: FiatToken.COP,
  network: Networks.Polygon,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Polygon
});

const { rampProcess } = await sdk.registerRamp(quote, {
  destinationAddress: "0x1234567890123456789012345678901234567890",
  walletAddress: "0x1234567890123456789012345678901234567890"
  // fiatAccountId is optional for onramp — the backend only requires destinationAddress.
});

// Inspect off-chain fiat payment instructions before starting.
const startedRamp = await sdk.startRamp(rampProcess.id);
console.log("Pay via:", startedRamp.achPaymentData);
```

### Alfredpay (USD / MXN / COP / ARS) offramp

```typescript
const quote = await sdk.createQuote({
  from: Networks.Polygon,
  inputAmount: "10",
  inputCurrency: EvmToken.USDC,
  network: Networks.Polygon,
  outputCurrency: FiatToken.MXN,
  rampType: RampDirection.SELL,
  to: EPaymentMethod.SPEI // USD and COP settle via EPaymentMethod.ACH
});

const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, {
  fiatAccountId: "<the user's Alfredpay fiat account id>",
  walletAddress: "0x1234567890123456789012345678901234567890"
});

// Sign and submit each user-side transaction before starting the ramp.
for (const tx of unsignedTransactions) {
  const txType = sdk.getUserTransactionType(tx);

  if (txType === "evm-typed-data") {
    const payloads = sdk.getTypedDataToSign(tx);
    const signatures = [];

    for (const payload of payloads) {
      signatures.push(await walletClient.signTypedData(payload));
    }

    await sdk.submitUserSignature(rampProcess.id, tx, signatures);
  } else if (txType === "evm-transaction") {
    const evmTx = sdk.getTransactionToBroadcast(tx);
    const hash = await walletClient.sendTransaction(evmTx);
    await sdk.submitUserTxHash(rampProcess.id, tx, hash);
  } else {
    throw new Error(`Unsupported user transaction for phase ${tx.phase} on ${tx.network}`);
  }
}

const startedRamp = await sdk.startRamp(rampProcess.id);
```

> `fiatAccountId` is opaque to the SDK. It is required for offramp and optional for onramp. Consumers create or look up the user's Alfredpay fiat account out-of-band (via the Vortex backend) and pass the ID in.

## Core Features
- **Ephemerals abstracted**: No need to keep track of the ephemeral accounts used in the ramp process. If `storeEphemeralKeys` is enabled, keys are stored in a JSON file in Node.js.
- **Stateless Design**: No internal state management - you control persistence of the rampId for status checking

## API Reference

### VortexSdk

#### Constructor

```typescript
new VortexSdk(config: VortexSdkConfig)
```

#### Methods

##### `createQuote(request: CreateQuoteRequest): Promise<QuoteResponse>`
Creates a new quote for a ramp operation.

##### `getQuote(quoteId: string): Promise<QuoteResponse>`
Retrieves an existing quote by ID.

##### `getRampStatus(rampId: string): Promise<RampProcess>`
Gets the current status of a ramp process.

##### `registerRamp<Q extends QuoteResponse>(quote: Q, additionalData: RegisterRampAdditionalData<Q>): Promise<{ rampProcess: RampProcess; unsignedTransactions: UnsignedTx[] }>`
Registers a new ramp process. Creates fresh Substrate and EVM ephemeral accounts, submits the quote and ephemeral addresses to the API, then signs and submits the returned ephemeral-owned transactions. Returns the ramp process and the user-owned `unsignedTransactions` that the caller must sign or broadcast.

##### `updateRamp<Q extends QuoteResponse>(quote: Q, rampId: string, additionalUpdateData: UpdateRampAdditionalData<Q>): Promise<RampProcess>`
Submits route-specific transaction hashes after off-chain steps complete. Used for sell flows. Buy flows do not require a separate update call.

##### `startRamp(rampId: string): Promise<RampProcess>`
Starts a registered ramp process.

##### `getUserTransactionType(tx: UnsignedTx): "evm-typed-data" | "evm-transaction" | "unsupported"`
Classifies a user-owned transaction returned by `registerRamp`. Unsupported transactions require a network-specific wallet flow outside the SDK helpers.

##### `getTypedDataToSign(tx: UnsignedTx, options?: { includeDomainType?: boolean }): SignedTypedData[]`
Returns the EIP-712 payloads to sign for an `"evm-typed-data"` transaction. Sign every payload in order and submit the signatures with `submitUserSignature`.

##### `submitUserSignature(rampId: string, tx: UnsignedTx, signatures: string | string[]): Promise<RampProcess>`
Attaches user EIP-712 signatures to the original unsigned transaction and submits them to Vortex.

##### `getTransactionToBroadcast(tx: UnsignedTx): EvmTransactionData`
Returns the EVM transaction data for an `"evm-transaction"` transaction. Throws for typed-data or unsupported transaction shapes.

##### `submitUserTxHash(rampId: string, tx: UnsignedTx, hash: string): Promise<RampProcess>`
Submits the on-chain transaction hash for a user-broadcast EVM transaction.

## Error Handling

### Ephemeral Account Freshness

`registerRamp` will throw `EphemeralNotFreshError` if the SDK-generated ephemeral address already has on-chain history (non-zero nonce or balance on Substrate/EVM, or a pre-existing account on Stellar) on any chain the ramp route uses. This should not happen during normal operation because the SDK generates fresh keypairs on every call, but it can occur on environments where ephemeral storage is reused across processes or if the same keys are imported elsewhere.

`EphemeralFreshnessCheckError` (HTTP 503) is thrown when the backend cannot reach an RPC endpoint to verify freshness. This is a transient failure.

Both errors are recoverable by simply re-invoking `registerRamp` — the SDK generates new ephemerals on every call:

```typescript
import { EphemeralNotFreshError, EphemeralFreshnessCheckError } from "@vortexfi/sdk";

try {
  const { rampProcess } = await sdk.registerRamp(quote, additionalData);
} catch (err) {
  if (err instanceof EphemeralNotFreshError || err instanceof EphemeralFreshnessCheckError) {
    // The SDK regenerates ephemerals on every call - retry once.
    const { rampProcess } = await sdk.registerRamp(quote, additionalData);
  } else {
    throw err;
  }
}
```

## Configuration

```typescript
interface VortexSdkConfig {
  apiBaseUrl: string;
  publicKey?: string;
  secretKey?: string;
  pendulumWsUrl?: string;
  moonbeamWsUrl?: string;
  hydrationWsUrl?: string;
  autoReconnect?: boolean;
  alchemyApiKey?: string;
  storeEphemeralKeys?: boolean;
}
```

Only the base Vortex API is required. If the RPC URL's are not provided, default public ones will be used.

### API keys

Two optional keys can be passed to the SDK:

- `publicKey` (`pk_live_*` / `pk_test_*`): attached to quote requests for partner attribution and discount eligibility.
- `secretKey` (`sk_live_*` / `sk_test_*`): sent as the `X-API-Key` header on every request, authenticating the partner.

Both are optional today. After the grace period, partner-scoped endpoints will reject calls that omit them, so it is recommended to start passing them now.

```typescript
const sdk = new VortexSdk({
  apiBaseUrl: "http://localhost:3000",
  publicKey: "pk_live_...",
  secretKey: "sk_live_..."
});
```


## Development

```bash
# Install dependencies
bun install

# Run example
bun run example.ts
```
