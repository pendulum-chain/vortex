import { useSubmitOfframp } from './useSubmitOfframp';
import { useOfframpEvents } from './useOfframpEvents';
import { useRampActions } from '../../stores/offrampStore';
import { useSep24Actions, useSep24InitialResponse, useSep24UrlInterval } from '../../stores/sep24Store';
import { useAnchorWindowHandler } from './useSEP24/useAnchorWindowHandler';
import { useVortexAccount } from '../useVortexAccount';
import { RampExecutionInput } from '../../types/phases';
import { RampService } from '../../services/api';

export const useMainProcess = () => {
  const { resetRampState, setRampStarted, setRampState } = useRampActions();
  const { chainId } = useVortexAccount();

  // Sep 24 states
  const firstSep24Response = useSep24InitialResponse();
  const firstSep24Interval = useSep24UrlInterval();

  const { cleanup: cleanupSep24 } = useSep24Actions();

  // Custom hooks
  const events = useOfframpEvents();
  const handleOnAnchorWindowOpen = useAnchorWindowHandler();

  const handleBrlaOfframpStart = async (executionInput: RampExecutionInput | undefined) => {
    if (!executionInput) {
      throw new Error('Missing execution input');
    }

    if (!executionInput.taxId || !executionInput.pixId || !executionInput.brlaEvmAddress) {
      throw new Error('Missing values on execution input');
    }

    if (!chainId) {
      throw new Error('Missing chainId');
    }

    const quoteId = executionInput.quote.id;
    // FIXME this should be a list of the ephemeral accounts + user account
    const signingAccounts = [];
    const walletAddress = executionInput.address;
    const additionalData = {
      walletAddress,
      pixDestination: executionInput.pixId,
      taxId: executionInput.taxId,
      brlaEvmAddress: executionInput.brlaEvmAddress,
    };
    const rampProcess = await RampService.registerRamp(quoteId, signingAccounts, additionalData);

    setRampState({
      quote: executionInput.quote,
      ramp: rampProcess
    })
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
