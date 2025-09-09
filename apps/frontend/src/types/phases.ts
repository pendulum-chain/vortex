import {
  EphemeralAccount,
  FiatToken,
  Networks,
  OnChainToken,
  PaymentData,
  PresignedTx,
  QuoteResponse,
  RampProcess,
  UpdateRampRequest
} from "@packages/shared";

export type RampSigningPhase = "login" | "started" | "approved" | "signed" | "finished";

export interface RampState {
  quote: QuoteResponse;
  ramp?: RampProcess;
  signedTransactions: PresignedTx[];
  // This is used to track if the user has completed all required actions. For offramps, it's about signing and submitting
  // transactions. For onramps, it's about acknowledging that the payment has been made.
  requiredUserActionsCompleted: boolean;
  userSigningMeta: UpdateRampRequest["additionalData"];
}

export interface RampExecutionInput {
  quote: QuoteResponse;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  userWalletAddress: string;
  ephemerals: {
    stellarEphemeral: EphemeralAccount;
    pendulumEphemeral: EphemeralAccount;
    moonbeamEphemeral: EphemeralAccount;
  };
  paymentData?: PaymentData;
  taxId?: string;
  pixId?: string;
  brlaEvmAddress?: string;
  network: Networks;
  setInitializeFailed: (message?: string | null) => void;
}
