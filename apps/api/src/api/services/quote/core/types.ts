import {
  AmountLimits,
  CreateQuoteRequest,
  DestinationType,
  EvmToken,
  PendulumCurrencyId,
  QuoteFeeStructure,
  QuoteResponse,
  RampCurrency,
  RampDirection,
  XcmFees
} from "@vortexfi/shared";
import { Big } from "big.js";

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
  targetDiscount?: number;
  maxSubsidy?: number;
  name?: string | null;
  maxDynamicDifference?: number;
  minDynamicDifference?: number;
  payoutAddressEvm?: string | null;
}

export type PartnerPricingSource = "request" | "profileAssignment" | "managerProfileAssignment" | "none";

// Quote context flows through all stages. Defined in quote-context.ts.
// Re-export here for convenience to avoid deep imports.
export interface QuoteContext {
  // immutable request details
  readonly request: CreateQuoteRequest & {
    apiCredentialId?: string;
    controllingManagerProfileId?: string;
    userId?: string;
  };
  readonly now: Date;

  // Partner info (if any)
  partner: PartnerInfo | null;

  // Quote ownership and pricing provenance. `partnerOwnerId` is used for
  // partner-principal ownership; `pricingPartnerId` is used for custom rates.
  partnerOwnerId?: string | null;
  pricingPartnerId?: string | null;
  partnerPricingSource?: PartnerPricingSource;

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

  nablaSwapEvm?: {
    inputAmountForSwapDecimal: string;
    inputAmountForSwapRaw: string;
    inputCurrency: EvmToken;
    inputToken: string; // ERC20 address
    inputDecimals: number;
    outputAmountRaw: string;
    outputAmountDecimal: Big;
    ammOutputAmountRaw?: string;
    ammOutputAmountDecimal?: Big;
    outputCurrency: EvmToken;
    outputDecimals: number;
    outputToken: string; // ERC20 address
    effectiveExchangeRate?: string;
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

  alfredpayMint?: {
    inputAmountDecimal: Big;
    inputAmountRaw: string;
    outputAmountDecimal: Big;
    outputAmountRaw: string;
    fee: Big;
    currency: RampCurrency;
    quoteId: string;
    expirationDate: Date;
  };

  alfredpayOfframp?: {
    inputAmountDecimal: Big;
    inputAmountRaw: string;
    outputAmountDecimal: Big;
    outputAmountRaw: string;
    fee: Big;
    currency: RampCurrency;
    quoteId: string;
    expirationDate: Date;
  };

  aveniaMint?: {
    inputAmountDecimal: Big;
    inputAmountRaw: string;
    outputAmountDecimal: Big;
    outputAmountRaw: string;
    fee: Big;
    currency: RampCurrency;
  };

  aveniaTransfer?: {
    inputAmountDecimal: Big;
    inputAmountRaw: string;
    outputAmountDecimal: Big;
    outputAmountRaw: string;
    fee: Big;
    currency: RampCurrency;
  };

  mykoboMint?: {
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
    vortexFeePenPercentage?: number;
  };

  subsidy?: {
    applied: boolean;
    subsidyRate: Big;
    partnerId: string | null;
    expectedOutputAmountDecimal: Big;
    expectedOutputAmountRaw: string;
    actualOutputAmountDecimal: Big;
    actualOutputAmountRaw: string;
    subsidyAmountInOutputTokenDecimal: Big;
    subsidyAmountInOutputTokenRaw: string;
    // Ideal subsidy needed to reach expected output (uncapped)
    idealSubsidyAmountInOutputTokenDecimal: Big;
    idealSubsidyAmountInOutputTokenRaw: string;
    // Target output amount after subsidy (actual output + subsidy)
    targetOutputAmountDecimal: Big;
    targetOutputAmountRaw: string;
  };

  subsidyDisplay?: {
    fiat: string;
    usd: string;
    currency: RampCurrency;
  };

  // Accumulated logs/notes for debugging (optional)
  notes?: string[];
  // Allow engines to supply a ready response (used by special-case engine and finalize stage)
  builtResponse?: QuoteResponse;

  /**
   * Resolved AlfredPay input-side amount limits in human units of `inputCurrency`.
   * Set by the finalize engine during validation for AlfredPay quotes; surfaced on the QuoteResponse.
   */
  alfredpayInputLimits?: AmountLimits;

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
