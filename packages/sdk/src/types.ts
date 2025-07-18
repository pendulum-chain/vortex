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

export type BrlaOnrampQuote = QuoteResponse & {
  rampType: "on";
  from: "pix";
};

export type EurOnrampQuote = QuoteResponse & {
  rampType: "on";
  from: "sepa";
};

export type BrlaOfframpQuote = QuoteResponse & {
  rampType: "off";
  to: "pix";
};

export type EurOfframpQuote = QuoteResponse & {
  rampType: "off";
  to: "sepa";
};

export type AnyQuote = BrlaOnrampQuote | EurOnrampQuote | BrlaOfframpQuote | EurOfframpQuote;

export type ExtendedQuoteResponse<T extends CreateQuoteRequest> = T extends { rampType: "on"; from: "pix" }
  ? BrlaOnrampQuote
  : T extends { rampType: "on"; from: "sepa" }
    ? EurOnrampQuote
    : T extends { rampType: "off"; to: "pix" }
      ? BrlaOfframpQuote
      : T extends { rampType: "off"; to: "sepa" }
        ? EurOfframpQuote
        : never;

export type RegisterRampAdditionalData<Q extends QuoteResponse> = Q extends BrlaOnrampQuote
  ? BrlaOnrampAdditionalData
  : Q extends EurOnrampQuote
    ? EurOnrampAdditionalData
    : Q extends BrlaOfframpQuote
      ? BrlaOfframpAdditionalData
      : Q extends EurOfframpQuote
        ? EurOfframpAdditionalData
        : never;

export interface BrlaOnrampAdditionalData {
  destinationAddress: string;
  taxId: string;
}

export interface EurOnrampAdditionalData {
  moneriumAuthToken: string;
}

export interface BrlaOfframpAdditionalData {
  pixDestination: string;
  receiverTaxId: string;
  taxId: string;
}

export interface EurOfframpAdditionalData {
  paymentData: PaymentData;
}

export type UpdateRampAdditionalData<Q extends QuoteResponse> = Q extends BrlaOnrampQuote
  ? never // No additional data required from the user for this type of ramp.
  : Q extends EurOnrampQuote
    ? EurOnrampUpdateAdditionalData
    : Q extends BrlaOfframpQuote
      ? BrlaOfframpUpdateAdditionalData
      : Q extends EurOfframpQuote
        ? EurOfframpUpdateAdditionalData
        : never;

export interface EurOnrampUpdateAdditionalData {
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  moneriumOfframpSignature: string;
}

export interface BrlaOfframpUpdateAdditionalData {
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  assetHubToPendulumHash: string;
}
export interface EurOfframpUpdateAdditionalData {
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  assetHubToPendulumHash: string;
}

export interface BrlaKycResponse {
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
}

// Handler interface for ramp-specific operations
export interface RampHandler {
  // Each handler implements the register-update-start flow
  // The update step may be invisible to the user (like in BRLA onramp)
}

// Context methods that handlers can use from VortexSdk
export interface VortexSdkContext {
  // Defined for future extensibility
}
