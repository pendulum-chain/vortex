import { useCallback } from 'react';
import Big from 'big.js';
import { PaymentData } from 'shared';

import { useNetwork } from '../../../contexts/network';

import { sep24Second } from '../../../services/anchor/sep24/second';

import { useTrackSEP24Events } from './useTrackSEP24Events';
import { usePendulumNode } from '../../../contexts/polkadotNode';
import { useRampActions, useRampStore } from '../../../stores/offrampStore';
import { useSep24AnchorSessionParams, useSep24InitialResponse } from '../../../stores/sep24Store';
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

  const {
    rampExecutionInput: executionInput,
    actions: { setRampExecutionInput },
  } = useRampStore();

  const handleAmountMismatch = useCallback(
    (setOfframpingStarted: (started: boolean) => void): void => {
      setOfframpingStarted(false);
      showToast(ToastMessage.AMOUNT_MISMATCH);
    },
    [showToast, ToastMessage],
  );

  return useCallback(async () => {
    console.log(
      'firstSep24Response',
      firstSep24Response,
      'anchorSessionParams',
      anchorSessionParams,
      'executionInput',
      executionInput,
    );
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

      const paymentData: PaymentData = {
        amount: secondSep24Response.amount,
        anchorTargetAccount: secondSep24Response.offrampingAccount,
        memo: secondSep24Response.memo,
        memoType: secondSep24Response.memoType as 'text' | 'hash',
      };

      setRampExecutionInput({ ...executionInput, paymentData });
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
