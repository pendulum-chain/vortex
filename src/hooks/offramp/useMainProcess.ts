import { useEffect } from 'react';
import Big from 'big.js';

import { useSubmitOfframp } from './useSubmitOfframp';
import { useOfframpEvents } from './useOfframpEvents';
import { useRampActions, useRampState } from '../../stores/offrampStore';
import { useSep24UrlInterval, useSep24InitialResponse } from '../../stores/sep24Store';
import { useSep24Actions } from '../../stores/sep24Store';
import { useAnchorWindowHandler } from './useSEP24/useAnchorWindowHandler';
import { Networks } from '../../helpers/networks';
import { ApiComponents } from '../../contexts/polkadotNode';
import { useVortexAccount } from '../useVortexAccount';
import { RampExecutionInput } from '../../types/phases';

export const useMainProcess = () => {
  const { resetRampState, setRampStarted } = useRampActions();
  const offrampState = useRampState();
  const { chainId } = useVortexAccount();

  // Sep 24 states
  const firstSep24Response = useSep24InitialResponse();
  const firstSep24Interval = useSep24UrlInterval();

  const { cleanup: cleanupSep24 } = useSep24Actions();

  // Custom hooks
  const events = useOfframpEvents();
  const handleOnAnchorWindowOpen = useAnchorWindowHandler();

  const handleBrlaOfframpStart = async (
    executionInput: RampExecutionInput | undefined,
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

    if (!chainId) {
      throw new Error('Missing chainId');
    }

    // const initialState = await constructBrlaInitialState({
    //   onChainToken: executionInput.inputTokenType,
    //   fiatToken: executionInput.outputTokenType,
    //   amountIn: executionInput.inputAmountUnits,
    //   amountOut: Big(executionInput.outputAmountUnits.beforeFees),
    //   network,
    //   networkId: chainId,
    //   pendulumNode,
    //   offramperAddress: address!,
    //   brlaEvmAddress: executionInput.brlaEvmAddress,
    //   pixDestination: executionInput.pixId,
    //   taxId: executionInput.taxId,
    // });
    // updateOfframpHookStateFromState(initialState);
    return;
  };

  return {
    handleOnSubmit: useSubmitOfframp(),
    firstSep24ResponseState: firstSep24Response,
    finishOfframping: () => {
      events.resetUniqueEvents();
      resetRampState();
      cleanupSep24();
    },
    continueFailedFlow: () => {
      // FIXME call into backend to retry the offramp
      // updateOfframpHookStateFromState(recoverFromFailure(offrampState));
    },
    handleOnAnchorWindowOpen: handleOnAnchorWindowOpen,
    handleBrlaOfframpStart: handleBrlaOfframpStart,
    maybeCancelSep24First: () => {
      if (firstSep24Interval !== undefined) {
        setRampStarted(false);
        cleanupSep24();
      }
    },
  };
};
