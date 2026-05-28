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

### Alfredpay (USD / MXN / COP) onramp

```typescript
import { VortexSdk, FiatToken, EvmToken, Networks, RampDirection } from "@vortexfi/sdk";

const sdk = new VortexSdk({ apiBaseUrl: "http://localhost:3000" });

const quote = await sdk.createQuote({
  inputAmount: "100",
  inputCurrency: FiatToken.COP,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Polygon
});

const { rampProcess } = await sdk.registerRamp(quote, {
  destinationAddress: "0x1234567890123456789012345678901234567890",
  fiatAccountId: "<the user's Alfredpay fiat account id>",
  walletAddress: "0x1234567890123456789012345678901234567890"
});

// Inspect off-chain fiat payment instructions before starting.
const startedRamp = await sdk.startRamp(rampProcess.id);
console.log("Pay via:", startedRamp.achPaymentData);
```

### Alfredpay (USD / MXN / COP) offramp

```typescript
const quote = await sdk.createQuote({
  from: Networks.Polygon,
  inputAmount: "10",
  inputCurrency: EvmToken.USDC,
  outputCurrency: FiatToken.MXN,
  rampType: RampDirection.SELL
});

const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, {
  fiatAccountId: "<the user's Alfredpay fiat account id>",
  walletAddress: "0x1234567890123456789012345678901234567890"
});

// Sign and submit the user-side EVM transactions (squidRouter approve/swap, etc.)
// then push the resulting hashes back to Vortex:
const updated = await sdk.updateRamp(quote, rampProcess.id, {
  squidRouterApproveHash: "0x...",
  squidRouterSwapHash: "0x..."
});

const startedRamp = await sdk.startRamp(updated.id);
```

> `fiatAccountId` is opaque to the SDK. Consumers create or look up the user's Alfredpay fiat account out-of-band (via the Vortex backend) and pass the ID in.

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
Registers a new ramp process. Creates fresh ephemeral accounts on Stellar, Pendulum, and Moonbeam, submits the quote and ephemeral addresses to the API, then signs and submits the returned unsigned transactions. Returns the ramp process and the list of unsigned transactions returned by the API for the caller's reference.

##### `updateRamp<Q extends QuoteResponse>(quote: Q, rampId: string, additionalUpdateData: UpdateRampAdditionalData<Q>): Promise<RampProcess>`
Submits route-specific transaction hashes after off-chain steps complete. Used for sell flows. Buy flows do not require a separate update call.

##### `startRamp(rampId: string): Promise<RampProcess>`
Starts a registered ramp process.

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
