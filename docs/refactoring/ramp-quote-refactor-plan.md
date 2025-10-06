# Ramp Quote Service Refactor: Architecture Plan

This document outlines the detailed architectural plan for refactoring the Ramp Quote Service. The goal is to create a modular, readable, and plug-and-play system using a Strategy and Pipeline architecture.

## 1. Directory and File Structure

The new structure will be located under `apps/api/src/api/services/ramp/quote.service/`.

```
apps/api/src/api/services/ramp/quote.service/
├── core/
│   ├── quote-orchestrator.ts
│   └── quote-context.ts
├── routes/
│   ├── route-resolver.ts
│   └── strategies/
│       ├── onramp-evm.strategy.ts
│       ├── onramp-assethub.strategy.ts
│       ├── offramp-pix.strategy.ts
│       ├── offramp-sepa.strategy.ts
│       └── offramp-cbu.strategy.ts
├── engines/
│   ├── input-planner.ts
│   ├── swap-engine.ts
│   ├── bridge-engine.ts
│   ├── fee-engine.ts
│   ├── discount-engine.ts
│   └── finalize-engine.ts
├── adapters/
│   ├── price-feed-adapter.ts
│   └── persistence-adapter.ts
├── mappers/
│   └── quote-mapper.ts
└── types.ts
```

### File Responsibilities

| File | Responsibility | Inputs | Outputs | Reuses Existing Helpers |
|---|---|---|---|---|
| **core/quote-orchestrator.ts** | Main coordinator. Creates `QuoteContext`, resolves strategy, runs engines, and persists the result. | `QuoteRequest` | `QuoteResponse` | `route-resolver`, all `engines`, `persistence-adapter` |
| **core/quote-context.ts** | Defines the `QuoteContext` class/interface that carries state through the pipeline. | Initial `QuoteRequest` data | `QuoteContext` object | - |
| **routes/route-resolver.ts** | Selects the appropriate strategy based on the quote request parameters. | `QuoteContext` | A strategy instance (e.g., `OnRampEvmStrategy`) | - |
| **routes/strategies/*.ts** | Defines the ordered pipeline of engines for a specific route. | `QuoteContext` | `QuoteContext` (mutated) | Specific `engines` |
| **engines/input-planner.ts** | Calculates pre-Nabla deductible fees and determines the input amount for the swap. | `QuoteContext` | `QuoteContext` with `preNablaDeductibleFees` and `inputAmountForSwap` | `quote-fees.ts`, `price-feed-adapter.ts` |
| **engines/swap-engine.ts** | Executes the Nabla swap. | `QuoteContext` | `QuoteContext` with `nablaSwapResult` | `gross-output.ts` |
| **engines/bridge-engine.ts** | Handles EVM bridging logic and fees. | `QuoteContext` | `QuoteContext` with `evmBridgeResult` | `gross-output.ts` |
| **engines/fee-engine.ts** | Aggregates all fee components and converts them to USD and the target display fiat. | `QuoteContext` | `QuoteContext` with `feeComponents` | `quote-fees.ts`, `price-feed-adapter.ts` |
| **engines/discount-engine.ts** | Applies partner discounts. | `QuoteContext` | `QuoteContext` with `discountInfo` | - |
| **engines/finalize-engine.ts** | Calculates the final net output, runs validation checks, and formats the final amounts. | `QuoteContext` | `QuoteContext` with `netOutputAmount`, formatted fields | `validation-helpers.ts`, `quote-mapper.ts` |
| **adapters/price-feed-adapter.ts** | Wrapper for `priceFeedService` to centralize currency conversion, rounding, and precision. | Currency pair, amount | Converted amount | `priceFeed.service.ts` |
| **adapters/persistence-adapter.ts** | Wrapper for creating `QuoteTicket` records in the database. | `QuoteContext` | `QuoteTicket` ID | `quoteTicket.model.ts` |
| **mappers/quote-mapper.ts** | Formats numbers and amounts for the final API response. | Numbers, amounts | Formatted strings | `helpers.ts` (e.g., `trimTrailingZeros`) |
| **types.ts** | Contains shared TypeScript types and interfaces for the quote service. | - | Types | - |

## 2. QuoteContext Data Model

The `QuoteContext` object will be a class instance passed through each stage of the pipeline. Each engine is responsible for populating its specific fields.

```typescript
// In core/quote-context.ts
import { QuoteRequest } from '...'; // Import from actual location
import { Partner } from '...'; // Import from actual location

export class QuoteContext {
  // --- Initial Fields ---
  public readonly request: QuoteRequest;
  public readonly partner?: Partner;
  public readonly targetFeeFiatCurrency: 'USD' | 'EUR' | 'BRL'; // etc.

  // --- Pipeline-Populated Fields ---
  // from input-planner
  public preNablaDeductibleFees?: FeeComponent[];
  public inputAmountForSwap?: BigNumber;

  // from swap-engine
  public nablaSwapResult?: {
    grossOutputAmount: BigNumber;
    // ... other nabla details
  };

  // from bridge-engine
  public evmBridgeResult?: {
    bridgeFeeUsd: BigNumber;
    networkFeeUsd: BigNumber;
    // ... other bridge details
  };

  // from fee-engine
  public feeComponents?: {
    usd: FeeStructure;
    displayFiat: FeeStructure;
  };

  // from discount-engine
  public discountInfo?: {
    discountAmount: BigNumber;
    applied: boolean;
  };

  // from finalize-engine
  public grossOutputAmount?: BigNumber;
  public netOutputAmount?: BigNumber;
  public formattedAmounts?: {
    input: string;
    output: string;
    // ... other formatted fields
  };

  // from persistence-adapter
  public persistenceIds?: {
    quoteTicketId: string;
  };

  constructor(request: QuoteRequest, partner?: Partner) {
    this.request = request;
    this.partner = partner;
    this.targetFeeFiatCurrency = getTargetFiat(request); // from helpers.ts
  }
}

// In types.ts
export interface FeeStructure {
  network: BigNumber;
  vortex: BigNumber;
  anchor: BigNumber;
  partnerMarkup: BigNumber;
  total: BigNumber;
  currency: string;
}
```

**Mutability Rules:**
- The `QuoteContext` is mutable. Each engine receives the context and adds or modifies fields.
- All monetary calculations should be performed using a `BigNumber` library to avoid precision loss.
- Currency conversions and rounding should **only** happen within the `price-feed-adapter.ts` and final formatting in `quote-mapper.ts` to prevent drift.

## 3. RouteResolver and Strategies

### RouteResolver

`route-resolver.ts` will contain a `RouteResolver` class.

```typescript
// In routes/route-resolver.ts
export class RouteResolver {
  public static resolve(context: QuoteContext): IQuoteStrategy {
    const { rampType, from, to, inputCurrency, outputCurrency } = context.request;

    if (rampType === 'on-ramp') {
      // Special case for Monerium EURe on-ramp
      if (inputCurrency === 'EUR' && to.network === 'assethub') {
        return new OnRampAssetHubStrategy();
      }
      if (to.network.startsWith('evm-')) { // Simplified logic
        return new OnRampEvmStrategy();
      }
    }

    if (rampType === 'off-ramp') {
      if (outputCurrency === 'BRL') {
        return new OffRampPixStrategy();
      }
      if (outputCurrency === 'EUR') {
        return new OffRampSepaStrategy();
      }
      // ... other off-ramp strategies
    }

    throw new Error('Unsupported route');
  }
}
```

### Strategies and Pipelines

Each strategy defines the sequence of engines to run.

| Strategy | Pipeline Stages | Optional Stages & Conditions |
|---|---|---|
| **On-ramp EVM** | `input-planner` -> `swap-engine` -> `bridge-engine` -> `fee-engine` -> `discount-engine` -> `finalize-engine` | - |
| **On-ramp AssetHub** | `input-planner` -> `swap-engine` -> `fee-engine` -> `discount-engine` -> `finalize-engine` | `bridge-engine` is **not** used. |
| **Off-ramp (PIX/SEPA/CBU)** | `input-planner` -> `swap-engine` -> `fee-engine` -> `discount-engine` -> `finalize-engine` | `input-planner` needs to pre-calculate the bridge fee for non-AssetHub sources to adjust the `inputForSwap`. This can be done by calling a helper from `bridge-engine`. |

## 4. Engines Responsibilities

- **input-planner.ts**:
  - Wraps `calculatePreNablaDeductibleFees` from `quote-fees.ts`.
  - For off-ramps from EVM chains, it will call a method on `bridge-engine` to get the estimated bridge fee to correctly calculate the amount available for the Nabla swap.
  - Handles the special Monerium/EUR/AssetHub logic.
- **swap-engine.ts**:
  - Wraps `calculateNablaSwapOutput` from `gross-output.ts`.
- **bridge-engine.ts**:
  - Wraps `calculateEvmBridgeAndNetworkFee` and `getEvmBridgeQuote` from `gross-output.ts`.
  - Exposes a helper function to estimate bridge fees for the `input-planner`.
- **fee-engine.ts**:
  - Wraps `calculateFeeComponents` from `quote-fees.ts`.
  - Centralizes all fee currency conversions. It will get all fee components, convert them to a baseline currency (USD) via `price-feed-adapter`, sum them, and then convert the total to the `targetFeeFiatCurrency`.
- **discount-engine.ts**:
  - Computes and applies partner discounts. For on-ramps, the subsidy is added to the output. For off-ramps, it's added to the final net fiat amount.
- **finalize-engine.ts**:
  - Calculates the final `netOutputAmount`.
  - On-ramp EVM: `netOutputAmount` is the `grossOutputAmount` from the bridge.
  - On-ramp AssetHub: `netOutputAmount` = `nablaSwapResult.grossOutputAmount` - (total fees converted to output token).
  - Off-ramp: `netOutputAmount` = `nablaSwapResult.grossOutputAmount` - (total fees converted to output fiat).
  - Runs min/max checks using `validation-helpers.ts`.
  - Calls `quote-mapper.ts` to format all amounts for the final response.

## 5. Adapters and Mappers

- **price-feed-adapter.ts**:
  - A thin wrapper around `priceFeedService`.
  - All methods will accept `BigNumber` and return `BigNumber`.
  - Centralizes rounding rules (e.g., `ROUND_HALF_UP`) and precision for all currency conversions.
  - Can implement retry/backoff logic for price feed calls if needed.
- **persistence-adapter.ts**:
  - A thin wrapper that takes the final `QuoteContext`.
  - Creates the `QuoteTicket` record in the database.
  - Returns the `quoteTicketId` to be stored in the context.
- **quote-mapper.ts**:
  - Contains pure functions for formatting.
  - Example: `formatAmount(amount: BigNumber, currency: string): string`.
  - Uses `trimTrailingZeros` and other helpers from `helpers.ts`.

## 6. Redundancy Simplification List

- **Fee Conversion**: `fee-engine` will be the single source of truth for fee calculations. It computes fees in USD, then converts to the display fiat currency once.
- **Monerium Path**: The special logic for the Monerium EUR on-ramp will be entirely contained within the `onramp-assethub.strategy.ts` and its associated engines. `quote-orchestrator.ts` will have no specific knowledge of it.
- **Squid Router Fee**: The network fee from Squid Router will be calculated and exposed by `bridge-engine.ts`.
- **Min/Max Checks**: These checks will be performed only once in `finalize-engine.ts`, with clear rules for BUY vs. SELL scenarios.

## 7. Migration Plan (Incremental)

1.  **PR1: Scaffolding**: Create the new directory structure and files with stubs (`// TODO: Implement`). Define `types.ts` and `quote-context.ts`. No behavior change.
2.  **PR2: Isolate Monerium**: Implement `onramp-assethub.strategy.ts` and the necessary parts of the engines. The main `quote.service/index.ts` will delegate to the new orchestrator *only* for this route. Add parity tests.
3.  **PR3: Port Core Engines**: Implement `input-planner.ts` and `swap-engine.ts`. Update all strategies to use them. The main service now delegates all routes to the orchestrator. Add parity tests.
4.  **PR4: Port Fee Logic**: Implement `fee-engine.ts` and `discount-engine.ts`. Remove redundant fee conversion logic from the old service file. Add parity tests.
5.  **PR5: Finalization & Persistence**: Implement `finalize-engine.ts`, `persistence-adapter.ts`, and `quote-mapper.ts`. The old service file should now be a very thin wrapper or completely replaced. Add snapshot tests for the final `QuoteResponse`.
6.  **PR6: Cleanup**: Remove the old service file and any unused helpers. Update `docs/architecture/ramp-journey-and-fees.md` with an "Implementation Notes" section referencing the new architecture.

## 8. Acceptance Criteria

- No regressions in quote outputs for all supported routes.
- The main `quote.service/index.ts` is reduced to a simple entry point that calls the `QuoteOrchestrator`.
- Unit tests for each engine with mocked adapters.
- Integration tests covering each strategy (e.g., On-ramp EVM, Off-ramp PIX).
- Logging is maintained or improved, with logs providing context about the current pipeline stage.

## 9. Test Plan

- **Input Matrix**:
  - On-ramp: EUR -> EVM, EUR -> AssetHub, BRL -> EVM, BRL -> AssetHub.
  - Off-ramp: AssetHub -> PIX, EVM -> SEPA, EVM -> CBU.
- **Snapshot Tests**:
  - Snapshot the entire `QuoteResponse` object, especially the `fee` structure in both USD and the display fiat.
- **Failure Simulation**:
  - Mock the `price-feed-adapter` to throw an error to ensure the `bridge-engine` and other components handle it gracefully.
  - Test edge cases like zero-amount quotes or unsupported pairs.
