import { useEffect, StateUpdater } from 'preact/compat';
import Big from 'big.js';

import { InputTokenType, OutputTokenType } from '../../constants/tokenConfig';
import { useNetwork } from '../../contexts/network';
import { recoverFromFailure, readCurrentState } from '../../services/offrampingFlow';

import { useSEP24 } from './useSEP24';
import { useSubmitOfframp } from './useSubmitOfframp';
import { useOfframpEvents } from './useOfframpEvents';
import { useOfframpAdvancement } from './useOfframpAdvancement';
import { useOfframpActions, useOfframpState } from '../../stores/offrampStore';

export type SigningPhase = 'started' | 'approved' | 'signed' | 'finished';

export interface ExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountInUnits: string;
  offrampAmount: Big;
  setInitializeFailed: StateUpdater<boolean>;
}

export const useMainProcess = () => {
  const { updateOfframpHookStateFromState, resetOfframpState, setOfframpStarted } = useOfframpActions();

  const offrampState = useOfframpState();

  // Contexts
  const { setOnSelectedNetworkChange } = useNetwork();

  // Custom hooks
  const events = useOfframpEvents();
  const sep24 = useSEP24();

  // Initialize state from storage
  useEffect(() => {
    const recoveryState = readCurrentState();
    updateOfframpHookStateFromState(recoveryState);
    events.trackOfframpingEvent(recoveryState);
  }, [updateOfframpHookStateFromState, events]);

  // Reset offramping state when the network is changed
  useEffect(() => {
    setOnSelectedNetworkChange(resetOfframpState);
  }, [setOnSelectedNetworkChange, resetOfframpState]);

  // Determines the current offramping phase
  useOfframpAdvancement();

  return {
    handleOnSubmit: useSubmitOfframp({
      ...sep24,
    }),
    firstSep24ResponseState: sep24.firstSep24Response,
    finishOfframping: () => {
      events.resetUniqueEvents();
      resetOfframpState();
    },
    continueFailedFlow: () => {
      updateOfframpHookStateFromState(recoverFromFailure(offrampState));
    },
    handleOnAnchorWindowOpen: sep24.handleOnAnchorWindowOpen,
    // @todo: why do we need this?
    maybeCancelSep24First: () => {
      if (sep24.firstSep24IntervalRef.current !== undefined) {
        setOfframpStarted(false);
        sep24.cleanSep24FirstVariables();
      }
    },
  };
};
