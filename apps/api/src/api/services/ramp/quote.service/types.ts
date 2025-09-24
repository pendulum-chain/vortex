// Strategy + Pipeline architecture
// Shared types and contracts used by the quote pipeline.

import {
  CreateQuoteRequest,
  DestinationType,
  QuoteFeeStructure,
  QuoteResponse,
  RampCurrency,
  RampDirection
} from "@packages/shared";
import { Big } from "big.js";

// Route profiles (optional tagging)
export enum RouteProfile {
  OnRampEvm = "OnRampEvm",
  OnRampAssetHub = "OnRampAssetHub",
  OffRampPix = "OffRampPix",
  OffRampSepa = "OffRampSepa",
  OffRampCbu = "OffRampCbu"
}

// Stage identifiers in the pipeline
export enum StageKey {
  ValidateChainSupport = "ValidateChainSupport",
  OnRampInputPlanner = "OnRampInputPlanner",
  OffRampInputPlanner = "OffRampInputPlanner",
  OnRampSwap = "OnRampSwap",
  OffRampSwap = "OffRampSwap",
  OnRampBridge = "OnRampBridge",
  OnRampFee = "OnRampFee",
  OffRampFee = "OffRampFee",
  OnRampDiscount = "OnRampDiscount",
  OffRampDiscount = "OffRampDiscount",
  OnRampFinalize = "OnRampFinalize",
  OffRampFinalize = "OffRampFinalize",
  // Special-case engine for Monerium EUR on-ramp to EVM
  SpecialOnrampEurEvm = "SpecialOnrampEurEvm"
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

  getEngines(ctx: QuoteContext): EnginesRegistry;

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
    displayFiat?: QuoteFeeStructure;
  };

  // Final amounts
  amounts?: {
    finalGrossOutput?: Big; // before discount
    finalNetOutput?: Big; // after fees and discount
  };

  subsidy?: {
    applied: boolean;
    rate: string;
    partnerId?: string;
    subsidyAmountInOutputToken?: string;
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

  // Allow engines to supply a ready response (used by special-case engine and finalize stage)
  builtResponse?: QuoteResponse;
}

export interface QuoteTicketMetadata extends Omit<QuoteContext, "now" | "addNote" | "builtResponse"> {
  offrampAmountBeforeAnchorFees?: string;
}
