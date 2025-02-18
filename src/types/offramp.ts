import { OfframpingState } from '../services/offrampingFlow';
import { InputTokenType, OutputTokenType } from '../constants/tokenConfig';

export type OfframpSigningPhase = 'login' | 'started' | 'approved' | 'signed' | 'finished';

// TODO rename
export interface OfframpExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  inputAmountUnits: string;
  outputAmountUnits: { beforeFees: string; afterFees: string };
  effectiveExchangeRate: string;
  stellarEphemeralSecret?: string;
  setInitializeFailed: (message?: string | null) => void;
}

export interface BrlaOfframpExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  inputAmountUnits: string;
  outputAmountUnits: { beforeFees: string; afterFees: string };
  effectiveExchangeRate: string;
  taxId: string;
  pixId: string;
  pendulumNode: any;
  setInitializeFailed: (message?: string | null) => void;
}

export interface OfframpState {
  offrampStarted: boolean;
  offrampInitiating: boolean;
  offrampState: OfframpingState | undefined;
  offrampSigningPhase: OfframpSigningPhase | undefined;
  offrampExecutionInput: OfframpExecutionInput | BrlaOfframpExecutionInput | undefined;
}

export interface OfframpActions {
  setOfframpStarted: (started: boolean) => void;
  setOfframpInitiating: (initiating: boolean) => void;
  setOfframpState: (state: OfframpingState | undefined) => void;
  setOfframpSigningPhase: (phase: OfframpSigningPhase | undefined) => void;
  setOfframpExecutionInput: (executionInput: OfframpExecutionInput | BrlaOfframpExecutionInput | undefined) => void;
  updateOfframpHookStateFromState: (state: OfframpingState | undefined) => void;
  resetOfframpState: () => void;
}
