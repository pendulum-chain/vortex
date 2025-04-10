import { useCallback } from 'react';
import Big from 'big.js';

import { useNetwork } from '../../../contexts/network';

import { sep24Second } from '../../../services/anchor/sep24/second';

import { useTrackSEP24Events } from './useTrackSEP24Events';
import { usePendulumNode } from '../../../contexts/polkadotNode';
import { useRampActions, useRampExecutionInput } from '../../../stores/offrampStore';
import { useSep24InitialResponse, useSep24AnchorSessionParams } from '../../../stores/sep24Store';
import { useVortexAccount } from '../../useVortexAccount';
import { useToastMessage } from '../../../helpers/notifications';

const handleError = (error: unknown, setRampingStarted: (started: boolean) => void): void => {
  console.error('Error in SEP-24 flow:', error);
  setRampingStarted(false);
};

export const useAnchorWindowHandler = () => {
  const { trackKYCStarted, trackKYCCompleted } = useTrackSEP24Events();
  const { selectedNetwork } = useNetwork();
  const { apiComponents: pendulumNode } = usePendulumNode();
  const { setRampStarted } = useRampActions();
  const { address, chainId } = useVortexAccount();

  const { showToast, ToastMessage } = useToastMessage();

  const firstSep24Response = useSep24InitialResponse();
  const anchorSessionParams = useSep24AnchorSessionParams();

  const executionInput = useRampExecutionInput();

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

    trackKYCStarted(executionInput, selectedNetwork);

    try {
      const secondSep24Response = await sep24Second(firstSep24Response, anchorSessionParams);
      const amountBeforeFees = Big(executionInput.quote.outputAmount).plus(executionInput.quote.fee).toFixed(2);

      if (!Big(secondSep24Response.amount).eq(amountBeforeFees)) {
        handleAmountMismatch(setRampStarted);
        return;
      }

      if (!executionInput.ephemerals.stellarEphemeral.secret) {
        throw new Error('Missing stellarEphemeralSecret on executionInput');
      }

      if (!address) {
        throw new Error('Missing address');
      }

      if (!chainId) {
        throw new Error('Missing chainId');
      }

      // TODO call into api
      // trackKYCCompleted(initialState, selectedNetwork);
    } catch (error) {
      handleError(error, setRampStarted);
    }
  }, [
    firstSep24Response,
    anchorSessionParams,
    executionInput,
    trackKYCStarted,
    selectedNetwork,
    address,
    chainId,
    handleAmountMismatch,
    setRampStarted,
  ]);
};
