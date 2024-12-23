import { useCallback } from 'preact/compat';
import { ApiPromise } from '@polkadot/api';
import Big from 'big.js';

import { Networks } from '../../../contexts/network';

import { constructInitialState, OfframpingState } from '../../../services/offrampingFlow';
import { sep24Second } from '../../../services/anchor';

import { showToast, ToastMessage } from '../../../helpers/notifications';

import { UseSEP24StateReturn } from './useSEP24State';
import { useTrackSEP24Events } from './useTrackSEP24Events';
import { useVortexAccount } from '../../useVortexAccount';

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
  const { firstSep24Response, anchorSessionParams, executionInput } = sep24State;
  const { address } = useVortexAccount();

  return useCallback(
    async (
      selectedNetwork: Networks,
      setOfframpingStarted: (started: boolean) => void,
      updateHookStateFromState: (state: OfframpingState | undefined) => void,
      pendulumNode: { ss58Format: number; api: ApiPromise; decimals: number },
    ) => {
      if (!firstSep24Response || !anchorSessionParams || !executionInput) {
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
          offramperAddress: address!,
        });

        trackKYCCompleted(initialState, selectedNetwork);
        updateHookStateFromState(initialState);
      } catch (error) {
        handleError(error, setOfframpingStarted);
      }
    },
    [firstSep24Response, anchorSessionParams, executionInput, trackKYCStarted, cleanupFn, trackKYCCompleted],
  );
};
