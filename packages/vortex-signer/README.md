# Vortex Signer

A stateless SDK that abstracts Vortex's API and ephemeral key handling for cross-chain ramp operations.

## Installation

```bash
npm install @packages/vortex-signer
```

## Quick Start

```typescript
import { VortexSdk, Networks, FiatToken, EvmToken } from "@packages/vortex-signer";
import type { VortexSdkConfig, BrlaOnrampAdditionalData, DestinationType } from "@packages/vortex-signer";

const config: VortexSdkConfig = {
  apiBaseUrl: "http://localhost:3000",
};

const signer = new VortexSdk(config);

const quoteRequest = {
  from: "pix" as DestinationType,
  inputAmount: "150000",
  inputCurrency: FiatToken.BRL,
  outputCurrency: EvmToken.USDC,
  rampType: "on" as const,
  to: Networks.Polygon,
};

const quote = await signer.createQuote(quoteRequest);

const brlaOnrampData: BrlaOnrampAdditionalData = {
  destinationAddress: "0x1234567890123456789012345678901234567890",
  taxId: "",
};

const registeredRamp = await signer.registerBrlaOnramp(quote.id, brlaOnrampData);

// Do the payment
const startedRamp = await signer.startBrlaOnramp(registeredRamp.id);
```

## Core Features
- **Ephemerals abstracted**: No need to keep track of the ephemeral accounts used in the ramp process. 
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

##### `registerBrlaOnramp(quoteId: string, additionalData: BrlaOnrampAdditionalData): Promise<RampProcess>`
Registers a new BRLA onramp process.

##### `startBrlaOnramp(rampId: string): Promise<RampProcess>`
Starts a registered BRLA onramp process.

## Configuration

```typescript
interface VortexSdkConfig {
  apiBaseUrl: string;
  pendulumWsUrl?: string;
  moonbeamWsUrl?: string;
  autoReconnect?: boolean;
  alchemyApiKey?: string;
}
```

Only the base Vortex API is required. If the RPC URL's are not provided, default public ones will be used.


## Development

```bash
# Install dependencies
bun install

# Run example
bun run example.ts
```
