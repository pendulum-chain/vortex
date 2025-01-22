import { useEffect } from 'preact/compat';
import Big from 'big.js';

import { recoverFromFailure, readCurrentState } from '../../services/offrampingFlow';

import { InputTokenType, OutputTokenType } from '../../constants/tokenConfig';

import { useSubmitOfframp } from './useSubmitOfframp';
import { useOfframpEvents } from './useOfframpEvents';
import { useOfframpAdvancement } from './useOfframpAdvancement';
import { useOfframpActions, useOfframpState } from '../../stores/offrampStore';
import { useSep24UrlInterval, useSep24InitialResponse } from '../../stores/sep24Store';
import { useSep24Actions } from '../../stores/sep24Store';
import { useAnchorWindowHandler } from './useSEP24/useAnchorWindowHandler';

export interface ExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountInUnits: string;
  offrampAmount: Big;
  setInitializeFailed: (message?: string | null) => void;
}

export const useMainProcess = () => {
  const { updateOfframpHookStateFromState, resetOfframpState, setOfframpStarted } = useOfframpActions();
  const offrampState = useOfframpState();

  // Sep 24 states
  const firstSep24Response = useSep24InitialResponse();
  const firstSep24Interval = useSep24UrlInterval();

  const { cleanup: cleanupSep24 } = useSep24Actions();

  // Custom hooks
  const events = useOfframpEvents();
  const handleOnAnchorWindowOpen = useAnchorWindowHandler();

  // Initialize state from storage
  useEffect(() => {
    const recoveryState = readCurrentState();
    updateOfframpHookStateFromState(recoveryState);
    events.trackOfframpingEvent(recoveryState);
    // Previously, adding events to the array was causeing a re-rendering loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateOfframpHookStateFromState, events.trackOfframpingEvent]);

  // Determines the current offramping phase
  useOfframpAdvancement();

  return {
    handleOnSubmit: useSubmitOfframp(),
    firstSep24ResponseState: firstSep24Response,
    finishOfframping: () => {
      events.resetUniqueEvents();
      resetOfframpState();
    },
    continueFailedFlow: () => {
      updateOfframpHookStateFromState(recoverFromFailure(offrampState));
    },
    handleOnAnchorWindowOpen: handleOnAnchorWindowOpen,
    maybeCancelSep24First: () => {
      if (firstSep24Interval !== undefined) {
        setOfframpStarted(false);
        cleanupSep24();
      }
    },
  };
};
