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
} from "@vortexfi/shared";

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
  sourceOrDestinationAddress: string; // The source address for offramps, destination address for onramps
  moneriumWalletAddress?: string; // Only needed for Monerium offramps to non-EVM chains (e.g. Monerium -> Assethub)
  ephemerals: {
    stellarEphemeral: EphemeralAccount;
    substrateEphemeral: EphemeralAccount;
    evmEphemeral: EphemeralAccount;
  };
  paymentData?: PaymentData;
  taxId?: string;
  pixId?: string;
  brlaEvmAddress?: string;
  network: Networks;
  setInitializeFailed: (message?: string | null) => void;
}
