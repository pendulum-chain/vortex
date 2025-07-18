import type {
  AccountMeta,
  EphemeralAccount,
  Networks,
  PaymentMethod,
  QuoteResponse,
  RampPhase,
  RampProcess,
  UnsignedTx
} from "@packages/shared";

export type { PaymentMethod };

// Union type of all possible additional data types
export type AnyRampAdditionalData =
  | BrlaOnrampAdditionalData
  | EurOnrampAdditionalData
  | BrlaOfframpAdditionalData
  | EurOfframpAdditionalData;

// Type-safe mapping for registerRamp function based on quote parameters
export type RegisterRampAdditionalData<Q extends QuoteResponse> = Q extends { rampType: "on"; from: "pix" }
  ? BrlaOnrampAdditionalData
  : Q extends { rampType: "on"; from: "sepa" }
    ? EurOnrampAdditionalData
    : Q extends { rampType: "off"; to: "pix" }
      ? BrlaOfframpAdditionalData
      : Q extends { rampType: "off"; to: "sepa" }
        ? EurOfframpAdditionalData
        : AnyRampAdditionalData; // Fallback for when TypeScript can't narrow the type

export interface BrlaOnrampAdditionalData {
  destinationAddress: string;
  taxId: string;
}

export interface EurOnrampAdditionalData {
  destinationAddress: string;
  taxId: string;
  paymentMethod: PaymentMethod;
}

export interface BrlaOfframpAdditionalData {
  sourceAddress: string;
  taxId: string;
  paymentMethod: PaymentMethod;
}

export interface EurOfframpAdditionalData {
  sourceAddress: string;
  taxId: string;
  paymentMethod: PaymentMethod;
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
