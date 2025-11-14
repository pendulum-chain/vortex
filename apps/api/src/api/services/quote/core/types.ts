// Strategy + Pipeline architecture
// Shared types and contracts used by the quote pipeline.

import {
  CreateQuoteRequest,
  DestinationType,
  PendulumCurrencyId,
  QuoteFeeStructure,
  QuoteResponse,
  RampCurrency,
  RampDirection,
  XcmFees
} from "@vortexfi/shared";
import { Big } from "big.js";

// Stage identifiers in the pipeline
export enum StageKey {
  Initialize = "Initialize",
  NablaSwap = "NablaSwap",
  PendulumTransfer = "PendulumTransfer",
  HydrationSwap = "HydrationSwap",
  SquidRouter = "SquidRouter",
  Fee = "Fee",
  Discount = "Discount",
  Finalize = "Finalize"
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

export interface StellarMeta {
  inputAmountDecimal: Big;
  inputAmountRaw: string;
  outputAmountDecimal: Big;
  outputAmountRaw: string;
  fee: Big;
  currency: RampCurrency;
}

// Partner info shared type
export interface PartnerInfo {
  id: string | null;
  discount?: number; // decimal, e.g., 0.05 => 5%
  name?: string | null;
}

// Strategy for a specific route/path
export interface IRouteStrategy {
  // Optional: human-friendly name for logging
  readonly name: string;

  // Ordered stages to execute for this route
  getStages(ctx: QuoteContext): StageKey[];

  getEngines(ctx: QuoteContext): EnginesRegistry;
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
    inputAmountForSwapDecimal: string;
    inputAmountForSwapRaw: string;
    inputCurrency: RampCurrency;
    inputCurrencyId: PendulumCurrencyId;
    inputToken: string; // ERC20 wrapper address
    inputDecimals: number;
    outputAmountRaw: string;
    outputAmountDecimal: Big;
    outputCurrencyId: PendulumCurrencyId;
    outputDecimals: number;
    outputToken: string; // ERC20 wrapper address
    effectiveExchangeRate?: string;
    outputCurrency: RampCurrency;
    oraclePrice?: Big;
  };

  hydrationSwap?: {
    inputAmountRaw: string;
    inputAmountDecimal: string;
    outputAmountRaw: string;
    outputAmountDecimal: string;
    minOutputAmountRaw: string;
    minOutputAmountDecimal: string;
    inputAsset: string; // Hydration Asset ID
    outputAsset: string; // Hydration Asset ID
    slippagePercent: number;
  };

  moneriumMint?: {
    inputAmountDecimal: Big;
    inputAmountRaw: string;
    outputAmountDecimal: Big;
    outputAmountRaw: string;
    fee: Big;
    currency: RampCurrency;
  };

  aveniaMint?: {
    inputAmountDecimal: Big;
    inputAmountRaw: string;
    outputAmountDecimal: Big;
    outputAmountRaw: string;
    fee: Big;
    currency: RampCurrency;
  };

  assethubToPendulumXcm?: XcmMeta;

  evmToEvm?: BridgeMeta;

  evmToMoonbeam?: BridgeMeta;

  hydrationToAssethubXcm?: XcmMeta;

  moonbeamToEvm?: BridgeMeta;

  evmToPendulum?: BridgeMeta;

  moonbeamToPendulumXcm?: XcmMeta;

  pendulumToHydrationXcm?: XcmMeta;

  pendulumToAssethubXcm?: XcmMeta;

  pendulumToMoonbeamXcm?: XcmMeta;

  pendulumToStellar?: StellarMeta;

  // Fees in baseline and display currency
  fees?: {
    // Baseline normalization currency: USD
    usd?: {
      vortex: string;
      anchor: string;
      partnerMarkup: string;
      network: string; // squidRouter only for now
      total: string;
    };
    displayFiat?: QuoteFeeStructure;
  };

  subsidy?: {
    applied: boolean;
    rate: string;
    partnerId?: string;
    subsidyAmountInOutputTokenDecimal: Big;
    subsidyAmountInOutputTokenRaw: string;
  };

  // Accumulated logs/notes for debugging (optional)
  notes?: string[];
  // Allow engines to supply a ready response (used by special-case engine and finalize stage)
  builtResponse?: QuoteResponse;

  // Flag to skip database persistence (for best quote comparison)
  skipPersistence?: boolean;

  // Helper: convenience accessors
  get isOnRamp(): boolean;

  get isOffRamp(): boolean;

  get from(): DestinationType;

  get to(): DestinationType;

  get direction(): RampDirection;

  addNote?(note: string): void;
}

export type QuoteTicketMetadata = Omit<QuoteContext, "now" | "addNote" | "builtResponse">;
