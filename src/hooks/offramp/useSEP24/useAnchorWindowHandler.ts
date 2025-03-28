import { useCallback } from 'react';
import Big from 'big.js';

import { useNetwork } from '../../../contexts/network';

import { constructInitialState } from '../../../services/offrampingFlow';
import { sep24Second } from '../../../services/anchor/sep24/second';

import { useToastMessage } from '../../../hooks/useToastMessage';

import { useTrackSEP24Events } from './useTrackSEP24Events';
import { usePendulumNode } from '../../../contexts/polkadotNode';
import { useOfframpActions, useOfframpExecutionInput } from '../../../stores/offrampStore';
import { useSep24InitialResponse, useSep24AnchorSessionParams } from '../../../stores/sep24Store';
import { useVortexAccount } from '../../useVortexAccount';

const handleError = (error: unknown, setOfframpingStarted: (started: boolean) => void): void => {
  console.error('Error in SEP-24 flow:', error);
  setOfframpingStarted(false);
};

export const useAnchorWindowHandler = () => {
  const { trackKYCStarted, trackKYCCompleted } = useTrackSEP24Events();
  const { selectedNetwork } = useNetwork();
  const { apiComponents: pendulumNode } = usePendulumNode();
  const { setOfframpStarted, updateOfframpHookStateFromState } = useOfframpActions();
  const { address, chainId } = useVortexAccount();

  const { showToast, ToastMessage } = useToastMessage();

  const firstSep24Response = useSep24InitialResponse();
  const anchorSessionParams = useSep24AnchorSessionParams();

  const executionInput = useOfframpExecutionInput();

  const handleAmountMismatch = useCallback(
    (setOfframpingStarted: (started: boolean) => void): void => {
      setOfframpingStarted(false);
      showToast(ToastMessage.AMOUNT_MISMATCH);
    },
    [showToast, ToastMessage],
  );

  return useCallback(async () => {
    if (!firstSep24Response || !anchorSessionParams || !executionInput) {
      return;
    }

    if (!pendulumNode) {
      console.error('Pendulum node not initialized');
      return;
    }

    trackKYCStarted(executionInput, selectedNetwork);

    try {
      const secondSep24Response = await sep24Second(firstSep24Response, anchorSessionParams);

      if (!Big(secondSep24Response.amount).eq(executionInput.outputAmountUnits.beforeFees)) {
        handleAmountMismatch(setOfframpStarted);
        return;
      }

      if (!executionInput.stellarEphemeralSecret) {
        throw new Error('Missing stellarEphemeralSecret on executionInput');
      }

      if (!address) {
        throw new Error('Missing address');
      }

      if (!chainId) {
        throw new Error('Missing chainId');
      }

      const initialState = await constructInitialState({
        sep24Id: firstSep24Response.id,
        stellarEphemeralSecret: executionInput.stellarEphemeralSecret,
        inputTokenType: executionInput.inputTokenType,
        outputTokenType: executionInput.outputTokenType,
        amountIn: executionInput.inputAmountUnits,
        amountOut: Big(executionInput.outputAmountUnits.beforeFees),
        sepResult: secondSep24Response,
        network: selectedNetwork,
        networkId: chainId,
        pendulumNode,
        offramperAddress: address,
      });

      trackKYCCompleted(initialState, selectedNetwork);
      updateOfframpHookStateFromState(initialState);
    } catch (error) {
      handleError(error, setOfframpStarted);
    }
  }, [
    firstSep24Response,
    anchorSessionParams,
    executionInput,
    pendulumNode,
    trackKYCStarted,
    selectedNetwork,
    address,
    chainId,
    trackKYCCompleted,
    updateOfframpHookStateFromState,
    handleAmountMismatch,
    setOfframpStarted,
  ]);
};
