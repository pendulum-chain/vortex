import { useEffect, StateUpdater } from 'preact/compat';
import Big from 'big.js';

import { InputTokenType, OutputTokenType } from '../../constants/tokenConfig';
import { useNetwork } from '../../contexts/network';
import { recoverFromFailure, readCurrentState } from '../../services/offrampingFlow';

import { useSEP24 } from './useSEP24';
import { useSubmitOfframp } from './useSubmitOfframp';
import { useOfframpingEvents } from './useOfframpingEvents';
import { useOfframpingAdvancement } from './useOfframpingAdvancement';
import { useOfframpStore } from '../../stores/offrampStore';

export type SigningPhase = 'started' | 'approved' | 'signed' | 'finished';

export interface ExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountInUnits: string;
  offrampAmount: Big;
  setInitializeFailed: StateUpdater<boolean>;
}

export const useMainProcess = () => {
  // State updater
  const {
    setOfframpingStarted,
    setIsInitiating,
    resetState,
    updateHookStateFromState,
    offrampingStarted,
    isInitiating,
    offrampingState,
    signingPhase,
  } = useOfframpStore();

  // Contexts
  const { setOnSelectedNetworkChange } = useNetwork();

  // Custom hooks
  const events = useOfframpingEvents();
  const sep24 = useSEP24();

  // Initialize state from storage
  useEffect(() => {
    const recoveryState = readCurrentState();
    updateHookStateFromState(recoveryState);
    events.trackOfframpingEvent(recoveryState);
  }, [updateHookStateFromState, events]);

  // Reset offramping state when the network is changed
  useEffect(() => {
    setOnSelectedNetworkChange(resetState);
  }, [setOnSelectedNetworkChange, resetState]);

  // Determines the current offramping phase
  useOfframpingAdvancement({
    addEvent: events.addEvent,
  });

  return {
    handleOnSubmit: useSubmitOfframp({
      ...sep24,
    }),
    firstSep24ResponseState: sep24.firstSep24Response,
    offrampingState,
    offrampingStarted,
    isInitiating,
    setIsInitiating,
    finishOfframping: () => {
      events.resetUniqueEvents();
      resetState();
    },
    continueFailedFlow: () => {
      updateHookStateFromState(recoverFromFailure(offrampingState));
    },
    handleOnAnchorWindowOpen: sep24.handleOnAnchorWindowOpen,
    signingPhase,
    // @todo: why do we need this?
    maybeCancelSep24First: () => {
      if (sep24.firstSep24IntervalRef.current !== undefined) {
        setOfframpingStarted(false);
        sep24.cleanSep24FirstVariables();
      }
    },
  };
};
