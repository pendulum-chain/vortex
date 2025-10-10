import type {
  CreateQuoteRequest,
  EphemeralAccount,
  PaymentData,
  PaymentMethod,
  QuoteResponse,
  RampPhase,
  UnsignedTx
} from "@packages/shared";
// Types re-exported used to create quotes.
import { EvmToken, FiatToken, Networks, RampDirection } from "@packages/shared";

export type { PaymentMethod };
export { EvmToken, FiatToken, Networks, RampDirection };

export type AnyQuote = BrlOnrampQuote | EurOnrampQuote | BrlOfframpQuote | EurOfframpQuote;

export type BrlOnrampQuote = QuoteResponse & {
  rampType: RampDirection.BUY;
  from: "pix";
};

export type EurOnrampQuote = QuoteResponse & {
  rampType: RampDirection.BUY;
  from: "sepa";
};

export type BrlOfframpQuote = QuoteResponse & {
  rampType: RampDirection.SELL;
  to: "pix";
};

export type EurOfframpQuote = QuoteResponse & {
  rampType: RampDirection.SELL;
  to: "sepa";
};

export type ExtendedQuoteResponse<T extends CreateQuoteRequest> = T extends { rampType: RampDirection.BUY; from: "pix" }
  ? BrlOnrampQuote
  : T extends { rampType: RampDirection.BUY; from: "sepa" }
    ? EurOnrampQuote
    : T extends { rampType: RampDirection.SELL; to: "pix" }
      ? BrlOfframpQuote
      : T extends { rampType: RampDirection.SELL; to: "sepa" }
        ? EurOfframpQuote
        : AnyQuote;

export type AnyAdditionalData =
  | BrlOfframpAdditionalData
  | EurOfframpAdditionalData
  | BrlOnrampAdditionalData
  | EurOnrampAdditionalData;

export type RegisterRampAdditionalData<Q extends QuoteResponse> = Q extends BrlOnrampQuote
  ? BrlOnrampAdditionalData
  : Q extends EurOnrampQuote
    ? EurOnrampAdditionalData
    : Q extends BrlOfframpQuote
      ? BrlOfframpAdditionalData
      : Q extends EurOfframpQuote
        ? EurOfframpAdditionalData
        : AnyAdditionalData;

export interface BrlOnrampAdditionalData {
  destinationAddress: string;
  taxId: string;
}

export interface EurOnrampAdditionalData {
  moneriumAuthToken: string;
}

export interface BrlOfframpAdditionalData {
  pixDestination: string;
  receiverTaxId: string;
  taxId: string;
  walletAddress: string;
}

export interface EurOfframpAdditionalData {
  paymentData: PaymentData;
  walletAddress: string;
}

export type AnyUpdateAdditionalData =
  | EurOnrampUpdateAdditionalData
  | BrlOfframpUpdateAdditionalData
  | EurOfframpUpdateAdditionalData;

export type UpdateRampAdditionalData<Q extends QuoteResponse> = Q extends BrlOnrampQuote
  ? never // No additional data required from the user for this type of ramp.
  : Q extends EurOnrampQuote
    ? EurOnrampUpdateAdditionalData
    : Q extends BrlOfframpQuote
      ? BrlOfframpUpdateAdditionalData
      : Q extends EurOfframpQuote
        ? EurOfframpUpdateAdditionalData
        : AnyUpdateAdditionalData;

export interface EurOnrampUpdateAdditionalData {
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  moneriumOfframpSignature: string;
}

export interface BrlOfframpUpdateAdditionalData {
  squidRouterApproveHash?: string;
  squidRouterSwapHash?: string;
  assethubToPendulumHash?: string;
}
export interface EurOfframpUpdateAdditionalData {
  squidRouterApproveHash?: string;
  squidRouterSwapHash?: string;
  assethubToPendulumHash?: string;
}

export interface BrlKycResponse {
  evmAddress: string;
  kycLevel: number;
}

export interface RampState {
  rampId: string;
  quoteId: string;
  ephemerals: {
    stellarEphemeral?: EphemeralAccount;
    pendulumEphemeral?: EphemeralAccount;
    moonbeamEphemeral?: EphemeralAccount;
  };
  currentPhase: RampPhase;
  unsignedTxs: UnsignedTx[];
}

export interface NetworkConfig {
  name: string;
  wsUrl: string;
}

export interface VortexSdkConfig {
  apiBaseUrl: string;
  pendulumWsUrl?: string;
  moonbeamWsUrl?: string;
  autoReconnect?: boolean;
  alchemyApiKey?: string;
  storeEphemeralKeys?: boolean;
}

// Handler interface for ramp-specific operations
// biome-ignore lint/complexity/noBannedTypes: TBD in the future
export type RampHandler = {};

// Context methods that handlers can use from VortexSdk
export interface VortexSdkContext {
  storeEphemerals: (ephemerals: { [key in Networks]?: EphemeralAccount }, rampId: string) => Promise<void>;
}
