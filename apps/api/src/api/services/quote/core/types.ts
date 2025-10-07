// Strategy + Pipeline architecture
// Shared types and contracts used by the quote pipeline.

import {
  CreateQuoteRequest,
  DestinationType,
  QuoteFeeStructure,
  QuoteResponse,
  RampCurrency,
  RampDirection,
  XcmFees
} from "@packages/shared";
import { Big } from "big.js";

// Route profiles (optional tagging)
export enum RouteProfile {
  OnRampEvm = "OnRampEvm",
  OnRampAssetHub = "OnRampAssetHub",
  OffRampPix = "OffRampPix",
  OffRampStellar = "OffRampStellar"
}

// Stage identifiers in the pipeline
export enum StageKey {
  OnRampInitialize = "OnRampInitialize",
  OffRampInitialize = "OffRampInitialize",
  OnRampNablaSwap = "OnRampNablaSwap",
  OffRampSwap = "OffRampSwap",
  OnRampPendulumTransfer = "OnRampPendulumTransfer",
  OffRampPendulumTransfer = "OffRampPendulumTransfer",
  OnRampHydration = "OnRampHydration",
  OnRampSquidRouter = "OnRampSquidRouter",
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

export interface BridgeMeta {
  effectiveExchangeRate?: string;
  fromNetwork: string;
  fromToken: `0x${string}`;
  inputAmountDecimal: Big;
  inputAmountRaw: string;
  outputAmountDecimal: Big;
  outputAmountRaw: string;
  toNetwork: string;
  toToken: `0x${string}`;
  networkFeeUSD: string;
}

export interface XcmMeta {
  fromToken: string;
  toToken: string;
  inputAmountDecimal: Big;
  inputAmountRaw: string;
  outputAmountDecimal: Big;
  outputAmountRaw: string;
  xcmFees: XcmFees;
}

// Partner info shared type
export interface PartnerInfo {
  id: string | null;
  discount?: number; // decimal, e.g., 0.05 => 5%
  name?: string | null;
}

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
  partner: PartnerInfo | null;

  // The fiat currency used for displaying fee breakdown (per helpers.getTargetFiatCurrency)
  targetFeeFiatCurrency: RampCurrency;

  // Intermediate computations populated by stages
  preNabla?: {
    deductibleFeeAmountInFeeCurrency?: Big;
    feeCurrency?: RampCurrency;
    // Representative currency for swap input (e.g., axlUSDC for eth)
    deductibleFeeAmountInSwapCurrency?: Big;
    representativeInputCurrency?: RampCurrency;
  };

  nablaSwap?: {
    inputAmountForSwap: string;
    inputAmountForSwapRaw: string;
    inputCurrency: RampCurrency;
    inputDecimals: number;
    outputAmountRaw: string;
    outputAmountDecimal: Big;
    outputDecimals: number;
    effectiveExchangeRate?: string;
    outputCurrency: RampCurrency;
  };

  hydrationSwap?: {
    amountInRaw: string;
    amountIn: string;
    amountOutRaw: string;
    amountOut: string;
    assetIn: string;
    assetOut: string;
  };

  moneriumMint?: {
    amountIn: Big;
    amountInRaw: string;
    amountOut: Big;
    amountOutRaw: string;
    fee: Big;
    currency: RampCurrency;
  };

  aveniaMint?: {
    amountIn: Big;
    amountInRaw: string;
    amountOut: Big;
    amountOutRaw: string;
    fee: Big;
    currency: RampCurrency;
  };

  assethubToPendulumXcm?: XcmMeta;

  evmToMoonbeam?: BridgeMeta;

  hydrationToAssethubXcm?: XcmMeta;

  moonbeamToEvm?: BridgeMeta;

  evmToPendulum?: BridgeMeta;

  moonbeamToPendulumXcm?: XcmMeta;

  pendulumToHydrationXcm?: XcmMeta;

  pendulumToAssethubXcm?: XcmMeta;

  pendulumToMoonbeamXcm?: XcmMeta;

  pendulumToStellar?: {
    amountIn: Big;
    amountInRaw: string;
    amountOut: Big;
    amountOutRaw: string;
    fee: Big;
    currency: RampCurrency;
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
