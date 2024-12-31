import { useCallback } from 'preact/compat';
import Big from 'big.js';

import { useNetwork } from '../../../contexts/network';

import { constructInitialState } from '../../../services/offrampingFlow';
import { sep24Second } from '../../../services/anchor';

import { showToast, ToastMessage } from '../../../helpers/notifications';

import { useTrackSEP24Events } from './useTrackSEP24Events';
import { usePendulumNode } from '../../../contexts/polkadotNode';
import { useOfframpActions } from '../../../stores/offrampStore';
import {
  useSep24Store,
  useSep24Actions,
  useFirstSep24Response,
  useAnchorSessionParams,
  useExecutionInput,
} from '../../../stores/sep24Store';
import { useVortexAccount } from '../../useVortexAccount';

const handleAmountMismatch = (setOfframpingStarted: (started: boolean) => void): void => {
  setOfframpingStarted(false);
  showToast(ToastMessage.AMOUNT_MISMATCH);
};

const handleError = (error: unknown, setOfframpingStarted: (started: boolean) => void): void => {
  console.error('Error in SEP-24 flow:', error);
  setOfframpingStarted(false);
};

export const useAnchorWindowHandler = () => {
  const { trackKYCStarted, trackKYCCompleted } = useTrackSEP24Events();
  const { selectedNetwork } = useNetwork();
  const { apiComponents: pendulumNode } = usePendulumNode();
  const { setOfframpStarted, updateOfframpHookStateFromState } = useOfframpActions();
  const { address } = useVortexAccount();

  const firstSep24Response = useFirstSep24Response();
  const anchorSessionParams = useAnchorSessionParams();

  const executionInput = useExecutionInput();
  const { cleanupSep24State } = useSep24Actions();

  return useCallback(async () => {
    if (!firstSep24Response || !anchorSessionParams || !executionInput) {
      return;
    }

    if (!pendulumNode) {
      console.error('Pendulum node not initialized');
      return;
    }

    trackKYCStarted(executionInput, selectedNetwork);
    cleanupSep24State();

    try {
      const secondSep24Response = await sep24Second(firstSep24Response, anchorSessionParams);

      if (!Big(secondSep24Response.amount).eq(executionInput.offrampAmount)) {
        handleAmountMismatch(setOfframpStarted);
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
        offramperAddress: address!,
      });

      trackKYCCompleted(initialState, selectedNetwork);
      updateOfframpHookStateFromState(initialState);
    } catch (error) {
      handleError(error, setOfframpStarted);
    }
  }, [
    address,
    cleanupSep24State,
    firstSep24Response,
    anchorSessionParams,
    executionInput,
    pendulumNode,
    trackKYCStarted,
    trackKYCCompleted,
    selectedNetwork,
    setOfframpStarted,
    updateOfframpHookStateFromState,
    address,
  ]);
};
