import { useState, useEffect, useCallback, StateUpdater } from 'preact/compat';
import Big from 'big.js';

import { InputTokenType, OutputTokenType } from '../../constants/tokenConfig';
import { useNetwork } from '../../contexts/network';
import {
  clearOfframpingState,
  recoverFromFailure,
  readCurrentState,
  OfframpingState,
} from '../../services/offrampingFlow';

import { useSEP24 } from './useSEP24';
import { useSubmitOfframp } from './useSubmitOfframp';
import { useOfframpingEvents } from './useOfframpingEvents';
import { useOfframpingReset } from './useOfframpingReset';
import { useOfframpingAdvancement } from './useOfframpingAdvancement';

export type SigningPhase = 'started' | 'approved' | 'signed' | 'finished';

export interface ExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountInUnits: string;
  offrampAmount: Big;
  setInitializeFailed: StateUpdater<boolean>;
}

export const useMainProcess = () => {
  // State management
  const [offrampingStarted, setOfframpingStarted] = useState<boolean>(false);
  const [isInitiating, setIsInitiating] = useState<boolean>(false);
  const [offrampingState, setOfframpingState] = useState<OfframpingState | undefined>(undefined);
  const [signingPhase, setSigningPhase] = useState<SigningPhase | undefined>(undefined);

  // Context
  const { selectedNetwork, setOnSelectedNetworkChange } = useNetwork();

  const events = useOfframpingEvents(selectedNetwork);
  const sep24 = useSEP24();

  const updateHookStateFromState = useCallback(
    (state: OfframpingState | undefined) => {
      if (!state || state.phase === 'success' || state.failure !== undefined) {
        setSigningPhase(undefined);
      }
      setOfframpingState(state);
      events.trackOfframpingEvent(state);
    },
    [events],
  );

  // Initialize state from storage
  useEffect(() => {
    updateHookStateFromState(readCurrentState());
  }, [updateHookStateFromState]);

  // Reset handlers
  const resetOfframpingState = useOfframpingReset({
    setOfframpingState,
    setOfframpingStarted,
    setIsInitiating,
    setAnchorSessionParams: sep24.setAnchorSessionParams,
    setFirstSep24Response: sep24.setFirstSep24Response,
    setExecutionInput: sep24.setExecutionInput,
    cleanSep24FirstVariables: sep24.cleanSep24FirstVariables,
    setSigningPhase,
  });

  // Reset offramping state when the network is changed
  useEffect(() => {
    setOnSelectedNetworkChange(resetOfframpingState);
  }, [setOnSelectedNetworkChange, resetOfframpingState]);

  const handleOnSubmit = useSubmitOfframp({
    ...sep24,
    offrampingStarted,
    offrampingState,
    setOfframpingStarted,
    setIsInitiating,
  });

  // Flow control handlers
  const finishOfframping = useCallback(async () => {
    await clearOfframpingState();
    events.resetUniqueEvents();
    setOfframpingStarted(false);
    updateHookStateFromState(undefined);
  }, [events, updateHookStateFromState]);

  const continueFailedFlow = useCallback(() => {
    updateHookStateFromState(recoverFromFailure(offrampingState));
  }, [updateHookStateFromState, offrampingState]);

  const maybeCancelSep24First = useCallback(() => {
    if (sep24.firstSep24IntervalRef.current !== undefined) {
      setOfframpingStarted(false);
      sep24.cleanSep24FirstVariables();
    }
  }, [sep24]);

  // Determines the current offramping phase
  useOfframpingAdvancement({
    offrampingState,
    updateHookStateFromState,
    addEvent: events.addEvent,
    setSigningPhase,
  });

  return {
    handleOnSubmit,
    firstSep24ResponseState: sep24.firstSep24Response,
    offrampingState,
    offrampingStarted,
    isInitiating,
    setIsInitiating,
    finishOfframping,
    continueFailedFlow,
    handleOnAnchorWindowOpen: sep24.handleOnAnchorWindowOpen,
    signingPhase,
    maybeCancelSep24First,
  };
};
