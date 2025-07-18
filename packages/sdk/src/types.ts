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

export type RampAdditionalData = {
  onramp: {
    pix: BrlaOnrampAdditionalData;
    sepa: EurOnrampAdditionalData;
  };
  offramp: {
    pix: BrlaOfframpAdditionalData;
    sepa: EurOfframpAdditionalData;
  };
};

export type InferAdditionalData<T extends "on" | "off", D extends "pix" | "sepa"> = T extends "on"
  ? D extends "pix"
    ? BrlaOnrampAdditionalData
    : EurOnrampAdditionalData
  : D extends "pix"
    ? BrlaOfframpAdditionalData
    : EurOfframpAdditionalData;

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
