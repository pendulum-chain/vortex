import type { DestinationType, EphemeralAccount, PaymentMethod, RampPhase, UnsignedTx } from "@packages/shared";
import type { ApiPromise } from "@polkadot/api";

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

export interface VortexSignerConfig {
  apiBaseUrl: string;
  pendulumWsUrl?: string;
  moonbeamWsUrl?: string;
  autoReconnect?: boolean;
  alchemyApiKey?: string;
}
