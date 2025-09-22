// PR1 scaffolding for Strategy + Pipeline architecture
// This file defines shared types and contracts used by the new quote pipeline.
// No behavior change in PR1.

import {
  CreateQuoteRequest,
  DestinationType,
  QuoteFeeStructure,
  QuoteResponse,
  RampCurrency,
  RampDirection
} from "@packages/shared";
import { Big } from "big.js";

// Stage identifiers in the pipeline
export enum StageKey {
  ValidateChainSupport = "ValidateChainSupport",
  InputPlanner = "InputPlanner",
  Swap = "Swap",
  Bridge = "Bridge",
  Fee = "Fee",
  Discount = "Discount",
  Finalize = "Finalize",
  Persist = "Persist"
}

// Minimal stage contract
export interface Stage {
  readonly key: StageKey;
  execute(ctx: QuoteContext): Promise<void>;
}

// Engines registry for orchestrator lookup
export type EnginesRegistry = {
  [K in StageKey]?: Stage;
};

// Strategy for a specific route/path
export interface IRouteStrategy {
  // Ordered stages to execute for this route
  getStages(ctx: QuoteContext): StageKey[];
  // Optional: human-friendly name for logging
  readonly name: string;
}

// Quote context flows through all stages. Defined in quote-context.ts.
// Re-export here for convenience to avoid deep imports.
export interface QuoteContext {
  // immutable request details
  readonly request: CreateQuoteRequest;
  readonly now: Date;

  // Partner info (if any)
  partner: {
    id: string | null;
    discount?: number; // decimal, e.g., 0.05 => 5%
    name?: string | null;
  } | null;

  // The fiat currency used for displaying fee breakdown (per helpers.getTargetFiatCurrency)
  targetFeeFiatCurrency: RampCurrency;

  // Intermediate computations populated by stages
  preNabla: {
    deductibleFeeAmount?: Big;
    feeCurrency?: RampCurrency;
    // Representative currency for swap input (e.g., axlUSDC for eth)
    representativeInputCurrency?: RampCurrency;
    // Input amount used for Nabla swap after pre-Nabla fee deduction
    inputAmountForSwap?: Big;
  };

  nabla?: {
    outputAmountRaw?: string; // raw from Nabla result
    outputAmountDecimal?: Big;
    effectiveExchangeRate?: string;
    outputCurrency?: RampCurrency; // the Nabla output currency used
  };

  bridge?: {
    // Squidrouter network fee
    networkFeeUSD?: string;
    finalGrossOutputAmountDecimal?: Big;
    finalEffectiveExchangeRate?: string;
    // On-ramp moonbeam raw amount for potential discount subsidy adjustment
    outputAmountMoonbeamRaw?: string;
  };

  // Fees in baseline and display currency
  fees?: {
    // Baseline normalization currency: USD
    usd?: {
      vortex: string;
      anchor: string;
      partnerMarkup: string;
      network: string; // squidrouter only for now
      total: string;
    };
    displayFiat?: {
      currency: RampCurrency;
      structure: QuoteFeeStructure;
    };
  };

  // Final amounts
  amounts?: {
    finalGrossOutput?: Big; // before discount
    finalNetOutput?: Big; // after fees and discount
  };

  // Discount application
  discount?: {
    applied: boolean;
    partnerId?: string;
    rate?: string; // decimal string
    subsidyAmountInOutputToken?: string; // formatted string
  };

  // Persistence artifacts
  persistence?: {
    quoteId?: string;
    expiresAt?: Date;
  };

  // Accumulated logs/notes for debugging (optional)
  notes?: string[];

  // Helper: convenience accessors
  get isOnRamp(): boolean;
  get isOffRamp(): boolean;
  get from(): DestinationType;
  get to(): DestinationType;
  get direction(): RampDirection;
  addNote?(note: string): void;
}

// Mapper output type
export type QuoteBuildResult = {
  response: QuoteResponse;
};

// Route profiles (optional tagging)
export enum RouteProfile {
  OnRampEvm = "OnRampEvm",
  OnRampAssetHub = "OnRampAssetHub",
  OffRampPix = "OffRampPix",
  OffRampSepa = "OffRampSepa",
  OffRampCbu = "OffRampCbu"
}
