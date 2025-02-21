import { OfframpingState } from '../services/offrampingFlow';
import { InputTokenType, OutputTokenType } from '../constants/tokenConfig';
import { Networks } from '../helpers/networks';
import { ApiPromise } from '@polkadot/api';

export type OfframpSigningPhase = 'login' | 'started' | 'approved' | 'signed' | 'finished';

export interface OfframpExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  inputAmountUnits: string;
  outputAmountUnits: {
    beforeFees: string;
    afterFees: string;
  };
  effectiveExchangeRate: string;
  stellarEphemeralSecret?: string;
  taxId?: string;
  pixId?: string;
  api: ApiPromise;
  address: string;
  network: Networks;
  requiresSquidRouter: boolean;
  expectedRedeemAmountRaw: string;
  inputAmountRaw: string;
  setInitializeFailed: (message?: string | null) => void;
}

export interface OfframpState {
  offrampStarted: boolean;
  offrampInitiating: boolean;
  offrampState: OfframpingState | undefined;
  offrampSigningPhase: OfframpSigningPhase | undefined;
  offrampExecutionInput: OfframpExecutionInput | undefined;
  offrampKycStarted: boolean;
}

export interface OfframpActions {
  setOfframpStarted: (started: boolean) => void;
  setOfframpInitiating: (initiating: boolean) => void;
  setOfframpState: (state: OfframpingState | undefined) => void;
  setOfframpSigningPhase: (phase: OfframpSigningPhase | undefined) => void;
  setOfframpKycStarted: (kycStarted: boolean) => void;
  setOfframpExecutionInput: (executionInput: OfframpExecutionInput | undefined) => void;
  updateOfframpHookStateFromState: (state: OfframpingState | undefined) => void;
  resetOfframpState: () => void;
}
