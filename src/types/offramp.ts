import { StateUpdater } from 'preact/hooks';
import Big from 'big.js';
import { OfframpingState } from '../services/offrampingFlow';
import { InputTokenType, OutputTokenType } from '../constants/tokenConfig';
import { ISep24Intermediate, IAnchorSessionParams } from '../services/anchor';

export type SigningPhase = 'started' | 'approved' | 'signed' | 'finished';

export interface ExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountInUnits: string;
  offrampAmount: Big;
  setInitializeFailed: StateUpdater<boolean>;
}

export interface OfframpState {
  // Core state
  offrampingStarted: boolean;
  isInitiating: boolean;
  offrampingState: OfframpingState | undefined;
  signingPhase: SigningPhase | undefined;

  // SEP24 related state
  anchorSessionParams: IAnchorSessionParams | undefined;
  firstSep24Response: ISep24Intermediate | undefined;
  executionInput: ExecutionInput | undefined;
}

export interface OfframpActions {
  setOfframpingStarted: (started: boolean) => void;
  setIsInitiating: (initiating: boolean) => void;
  setOfframpingState: (state: OfframpingState | undefined) => void;
  setSigningPhase: (phase: SigningPhase | undefined) => void;
  setSep24Params: (
    params: Partial<Pick<OfframpState, 'anchorSessionParams' | 'firstSep24Response' | 'executionInput'>>,
  ) => void;
  updateHookStateFromState: (state: OfframpingState | undefined) => void;
  resetState: () => void;
}
