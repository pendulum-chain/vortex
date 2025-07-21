import type {
  CreateQuoteRequest,
  EphemeralAccount,
  PaymentData,
  PaymentMethod,
  QuoteResponse,
  RampPhase,
  UnsignedTx
} from "@packages/shared";

export type { PaymentMethod };

export type AnyQuote = BrlOnrampQuote | EurOnrampQuote | BrlOfframpQuote | EurOfframpQuote;

export type BrlOnrampQuote = QuoteResponse & {
  rampType: "on";
  from: "pix";
};

export type EurOnrampQuote = QuoteResponse & {
  rampType: "on";
  from: "sepa";
};

export type BrlOfframpQuote = QuoteResponse & {
  rampType: "off";
  to: "pix";
};

export type EurOfframpQuote = QuoteResponse & {
  rampType: "off";
  to: "sepa";
};

export type ExtendedQuoteResponse<T extends CreateQuoteRequest> = T extends { rampType: "on"; from: "pix" }
  ? BrlOnrampQuote
  : T extends { rampType: "on"; from: "sepa" }
    ? EurOnrampQuote
    : T extends { rampType: "off"; to: "pix" }
      ? BrlOfframpQuote
      : T extends { rampType: "off"; to: "sepa" }
        ? EurOfframpQuote
        : AnyQuote;

export type AnyAdditionalData =
  | BrlOfframpAdditionalData
  | EurOfframpAdditionalData
  | BrlOnrampAdditionalData
  | EurOnrampAdditionalData
  | EurOnrampUpdateAdditionalData
  | EurOfframpUpdateAdditionalData
  | BrlOfframpUpdateAdditionalData;

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
}

export interface EurOfframpAdditionalData {
  paymentData: PaymentData;
}

export type UpdateRampAdditionalData<Q extends QuoteResponse> = Q extends BrlOnrampQuote
  ? never // No additional data required from the user for this type of ramp.
  : Q extends EurOnrampQuote
    ? EurOnrampUpdateAdditionalData
    : Q extends BrlOfframpQuote
      ? BrlOfframpUpdateAdditionalData
      : Q extends EurOfframpQuote
        ? EurOfframpUpdateAdditionalData
        : AnyAdditionalData;

export interface EurOnrampUpdateAdditionalData {
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  moneriumOfframpSignature: string;
}

export interface BrlOfframpUpdateAdditionalData {
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  assetHubToPendulumHash: string;
}
export interface EurOfframpUpdateAdditionalData {
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  assetHubToPendulumHash: string;
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
export interface RampHandler {
  // Each handler implements the register-update-start flow
  // The update step may be invisible to the user (like in BRL onramp)
}

// Context methods that handlers can use from VortexSdk
export interface VortexSdkContext {
  // Defined for future extensibility
}
