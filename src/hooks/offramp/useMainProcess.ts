import { useEffect } from 'react';
import Big from 'big.js';

import { recoverFromFailure, readCurrentState, constructBrlaInitialState } from '../../services/offrampingFlow';

import { useSubmitOfframp } from './useSubmitOfframp';
import { useOfframpEvents } from './useOfframpEvents';
import { useOfframpAdvancement } from './useOfframpAdvancement';
import { useOfframpActions, useOfframpState } from '../../stores/offrampStore';
import { useSep24UrlInterval, useSep24InitialResponse } from '../../stores/sep24Store';
import { useSep24Actions } from '../../stores/sep24Store';
import { useAnchorWindowHandler } from './useSEP24/useAnchorWindowHandler';
import { OfframpExecutionInput } from '../../types/offramp';
import { Networks } from '../../helpers/networks';
import { ApiComponents } from '../../contexts/polkadotNode';

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

  const handleBrlaOfframpStart = async (
    executionInput: OfframpExecutionInput | undefined,
    network: Networks,
    address: string,
    pendulumNode: ApiComponents,
  ) => {
    if (!executionInput) {
      throw new Error('Missing execution input');
    }

    if (!executionInput.taxId || !executionInput.pixId || !executionInput.brlaEvmAddress) {
      throw new Error('Missing values on execution input');
    }

    const initialState = await constructBrlaInitialState({
      inputTokenType: executionInput.inputTokenType,
      outputTokenType: executionInput.outputTokenType,
      amountIn: executionInput.inputAmountUnits,
      amountOut: Big(executionInput.outputAmountUnits.beforeFees),
      network,
      pendulumNode,
      offramperAddress: address!,
      brlaEvmAddress: executionInput.brlaEvmAddress,
      pixDestination: executionInput.pixId,
      taxId: executionInput.taxId,
    });
    updateOfframpHookStateFromState(initialState);
    return;
  };

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
    handleBrlaOfframpStart: handleBrlaOfframpStart,
    maybeCancelSep24First: () => {
      if (firstSep24Interval !== undefined) {
        setOfframpStarted(false);
        cleanupSep24();
      }
    },
  };
};
