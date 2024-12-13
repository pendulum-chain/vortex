import { useCallback } from 'preact/compat';
import Big from 'big.js';

import { useNetwork } from '../../../contexts/network';

import { constructInitialState } from '../../../services/offrampingFlow';
import { sep24Second } from '../../../services/anchor';

import { showToast, ToastMessage } from '../../../helpers/notifications';

import { UseSEP24StateReturn } from './useSEP24State';
import { useTrackSEP24Events } from './useTrackSEP24Events';
import { usePendulumNode } from '../../../contexts/polkadotNode';
import { useOfframpStore } from '../../../stores/offrampStore';

const handleAmountMismatch = (setOfframpingStarted: (started: boolean) => void): void => {
  setOfframpingStarted(false);
  showToast(ToastMessage.AMOUNT_MISMATCH);
};

const handleError = (error: unknown, setOfframpingStarted: (started: boolean) => void): void => {
  console.error('Error in SEP-24 flow:', error);
  setOfframpingStarted(false);
};

export const useAnchorWindowHandler = (sep24State: UseSEP24StateReturn, cleanupFn: () => void) => {
  const { trackKYCStarted, trackKYCCompleted } = useTrackSEP24Events();
  const { selectedNetwork } = useNetwork();
  const { apiComponents: pendulumNode } = usePendulumNode();
  const { setOfframpingStarted, updateHookStateFromState } = useOfframpStore();

  const { firstSep24Response, anchorSessionParams, executionInput } = sep24State;

  return useCallback(async () => {
    if (!firstSep24Response || !anchorSessionParams || !executionInput) {
      return;
    }

    if (!pendulumNode) {
      console.error('Pendulum node not initialized');
      return;
    }

    trackKYCStarted(executionInput, selectedNetwork);
    cleanupFn();

    try {
      const secondSep24Response = await sep24Second(firstSep24Response, anchorSessionParams);

      if (!Big(secondSep24Response.amount).eq(executionInput.offrampAmount)) {
        handleAmountMismatch(setOfframpingStarted);
        return;
      }

      const initialState = await constructInitialState({
        sep24Id: firstSep24Response.id,
        stellarEphemeralSecret: executionInput.stellarEphemeralSecret,
        inputTokenType: executionInput.inputTokenType,
        outputTokenType: executionInput.outputTokenType,
        amountIn: executionInput.amountInUnits,
        amountOut: executionInput.offrampAmount,
        sepResult: secondSep24Response,
        network: selectedNetwork,
        pendulumNode,
      });

      trackKYCCompleted(initialState, selectedNetwork);
      updateHookStateFromState(initialState);
    } catch (error) {
      handleError(error, setOfframpingStarted);
    }
  }, [
    firstSep24Response,
    anchorSessionParams,
    executionInput,
    pendulumNode,
    trackKYCStarted,
    cleanupFn,
    trackKYCCompleted,
    selectedNetwork,
    setOfframpingStarted,
    updateHookStateFromState,
  ]);
};
