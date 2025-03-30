import { FiatToken, Networks, OnChainToken, QuoteEndpoints, RampEndpoints } from 'shared';

export type RampSigningPhase = 'login' | 'started' | 'approved' | 'signed' | 'finished';

export interface RampState {
  quote: QuoteEndpoints.QuoteResponse;
  ramp?: RampEndpoints.RampProcess;
}

export interface RampExecutionInput {
  quote: QuoteEndpoints.QuoteResponse;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  address: string;
  stellarEphemeralSecret?: string;
  taxId?: string;
  pixId?: string;
  brlaEvmAddress?: string;
  network: Networks;
  setInitializeFailed: (message?: string | null) => void;
}

export interface RampZustand {
  rampStarted: boolean;
  rampInitiating: boolean;
  rampState: RampState | undefined;
  rampSigningPhase: RampSigningPhase | undefined;
  rampExecutionInput: RampExecutionInput | undefined;
  rampKycStarted: boolean;
  initializeFailedMessage: string | undefined;
  rampSummaryVisible: boolean;
}

export interface RampActions {
  setRampStarted: (started: boolean) => void;
  setRampInitiating: (initiating: boolean) => void;
  setRampState: (state: RampState | undefined) => void;
  setRampSigningPhase: (phase: RampSigningPhase | undefined) => void;
  setRampKycStarted: (kycStarted: boolean) => void;
  setRampExecutionInput: (executionInput: RampExecutionInput | undefined) => void;
  setInitializeFailedMessage: (message: string | undefined) => void;
  setRampSummaryVisible: (visible: boolean) => void;
  clearInitializeFailedMessage: () => void;
  resetRampState: () => void;
}
