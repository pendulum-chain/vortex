import { Dispatch, SetStateAction } from 'react';
import Big from 'big.js';

import { OfframpingState } from '../services/offrampingFlow';
import { InputTokenType, OutputTokenType } from '../constants/tokenConfig';
import { ISep24Intermediate, IAnchorSessionParams } from './sep';

export type OfframpSigningPhase = 'login' | 'started' | 'approved' | 'signed' | 'finished';

export interface OfframpExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountInUnits: string;
  offrampAmount: Big;
  setInitializeFailed: Dispatch<SetStateAction<boolean>>;
}

export interface OfframpState {
  // Core state
  offrampStarted: boolean;
  offrampInitiating: boolean;
  offrampState: OfframpingState | undefined;
  offrampSigningPhase: OfframpSigningPhase | undefined;

  // SEP24 related state @todo move to separate store
  offrampAnchorSessionParams: IAnchorSessionParams | undefined;
  offrampFirstSep24Response: ISep24Intermediate | undefined;
  offrampExecutionInput: OfframpExecutionInput | undefined;
}

export interface OfframpActions {
  setOfframpStarted: (started: boolean) => void;
  setOfframpInitiating: (initiating: boolean) => void;
  setOfframpState: (state: OfframpingState | undefined) => void;
  setOfframpSigningPhase: (phase: OfframpSigningPhase | undefined) => void;
  setOfframpSep24Params: (
    params: Partial<
      Pick<OfframpState, 'offrampAnchorSessionParams' | 'offrampFirstSep24Response' | 'offrampExecutionInput'>
    >,
  ) => void;
  updateOfframpHookStateFromState: (state: OfframpingState | undefined) => void;
  resetOfframpState: () => void;
}
