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
import {  VortexSdk } from "@vortexfi/sdk";
import { FiatToken, EvmToken, Networks} from "@vortexfi/sdk";
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
  rampType: "on" as const,
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
const { depositQrCode } = rampProcess
console.log("Please do the pix transfer using the following code: ", depositQrCode)

//Once the payment is done, start the ramp.
const startedRamp = await sdk.startRamp(quote, rampProcess.id);
```

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

##### `registerRamp<Q extends QuoteResponse>(quote: Q, additionalData: RegisterRampAdditionalData<Q>): Promise<RampProcess>`
Registers a new onramp process. Returns the ramp process, and a 
list of transaction data objects (`unsignedTransactions`) that must be signed and sent before starting the ramp.

##### `startRamp<Q extends QuoteResponse>(quote: Q, rampId: string): Promise<RampProcess>`
Starts a registered onramp process.

## Configuration

```typescript
interface VortexSdkConfig {
  apiBaseUrl: string;
  publicKey?: string;
  secretKey?: string;
  pendulumWsUrl?: string;
  moonbeamWsUrl?: string;
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
