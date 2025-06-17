import {
  FiatToken,
  Networks,
  OnChainToken,
  PaymentData,
  PresignedTx,
  QuoteResponse,
  RampProcess,
  UpdateRampRequest,
} from '@packages/shared';
import { EphemeralAccount } from '@packages/shared';

export type RampSigningPhase = 'login' | 'started' | 'approved' | 'signed' | 'finished';

export interface RampState {
  quote: QuoteResponse;
  ramp?: RampProcess;
  signedTransactions: PresignedTx[];
  // This is used to track if the user has completed all required actions. For offramps, it's about signing and submitting
  // transactions. For onramps, it's about acknowledging that the payment has been made.
  requiredUserActionsCompleted: boolean;
  userSigningMeta: UpdateRampRequest['additionalData'];
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

export interface RampZustand {
  rampStarted: boolean;
  rampRegistered: boolean;
  rampInitiating: boolean;
  rampState: RampState | undefined;
  rampSigningPhase: RampSigningPhase | undefined;
  rampExecutionInput: RampExecutionInput | undefined;
  rampKycStarted: boolean;
  rampKycLevel2Started: boolean;
  rampPaymentConfirmed: boolean;
  initializeFailedMessage: string | undefined;
  rampSummaryVisible: boolean;
  canRegisterRamp: boolean;
  signingRejected: boolean;
}

export interface RampActions {
  setRampStarted: (started: boolean) => void;
  setRampRegistered: (registered: boolean) => void;
  setRampInitiating: (initiating: boolean) => void;
  setRampState: (state: RampState | undefined) => void;
  setRampSigningPhase: (phase: RampSigningPhase | undefined) => void;
  setRampKycStarted: (kycStarted: boolean) => void;
  setRampKycLevel2Started: (kycLevel2Started: boolean) => void;
  setRampPaymentConfirmed: (paymentConfirmed: boolean) => void;
  setRampExecutionInput: (executionInput: RampExecutionInput | undefined) => void;
  setInitializeFailedMessage: (message: string | undefined) => void;
  setRampSummaryVisible: (visible: boolean) => void;
  clearInitializeFailedMessage: () => void;
  resetRampState: () => void;
  setCanRegisterRamp: (canRegister: boolean) => void;
  setSigningRejected: (rejected: boolean) => void;
}
