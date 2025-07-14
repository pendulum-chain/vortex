import type {
  AccountMeta,
  EphemeralAccount,
  Networks,
  PaymentMethod,
  RampPhase,
  RampProcess,
  UnsignedTx
} from "@packages/shared";

export type { PaymentMethod };

export interface QuoteResponse {
  id: string;
  rampType: "on" | "off";
  from: string;
  to: string;
  inputAmount: string;
  outputAmount: string;
  inputCurrency: string;
  outputCurrency: string;
  fee: string;
  expiresAt: string;
}

export interface BrlaOnrampAdditionalData {
  destinationAddress: string;
  taxId: string;
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

export interface VortexSignerConfig {
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

// Context methods that handlers can use from VortexSigner
export interface VortexSignerContext {
  generateEphemerals(networks: Networks[]): Promise<{
    ephemerals: { [key in Networks]?: EphemeralAccount };
    accountMetas: AccountMeta[];
  }>;
  signTransactions(rampId: string, unsignedTxs: UnsignedTx[]): Promise<any[]>;
  setEphemerals(
    rampId: string,
    ephemerals: {
      stellarEphemeral?: EphemeralAccount;
      pendulumEphemeral?: EphemeralAccount;
      moonbeamEphemeral?: EphemeralAccount;
    }
  ): void;
  createRampState(rampId: string, quoteId: string, currentPhase: RampPhase, unsignedTxs: UnsignedTx[]): void;
  updateRampState(rampId: string, currentPhase: RampPhase, unsignedTxs: UnsignedTx[]): void;
  hasRampState(rampId: string): boolean;
}
