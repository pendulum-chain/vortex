import { useSubmitOfframp } from './useSubmitOfframp';
import { useOfframpEvents } from './useOfframpEvents';
import { useRampActions, useRampExecutionInput, useRampState } from '../../stores/offrampStore';
import { useSep24Actions, useSep24InitialResponse, useSep24UrlInterval } from '../../stores/sep24Store';
import { useAnchorWindowHandler } from './useSEP24/useAnchorWindowHandler';
import { useVortexAccount } from '../useVortexAccount';
import { RampExecutionInput } from '../../types/phases';
import { RampService } from '../../services/api';
import { AccountMeta, getAddressForFormat, Networks, PresignedTx, UnsignedTx } from 'shared';
import { signUnsignedTransactions } from '../../services/api/pre-signature';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { useEffect } from 'react';

export const useMainProcess = () => {
  const { resetRampState, setRampStarted, setRampState } = useRampActions();
  const rampState = useRampState();
  const executionInput = useRampExecutionInput();
  const { address, chainId } = useVortexAccount();
  const { apiComponents } = usePendulumNode();

  // Sep 24 states
  const firstSep24Response = useSep24InitialResponse();
  const firstSep24Interval = useSep24UrlInterval();

  const { cleanup: cleanupSep24 } = useSep24Actions();

  // Custom hooks
  const events = useOfframpEvents();
  const handleOnAnchorWindowOpen = useAnchorWindowHandler();

  const handleBrlaOfframpStart = async () => {
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
    const signingAccounts: AccountMeta[] = [
      { address: executionInput.stellarEphemeral.address, network: Networks.Stellar },
      { address: executionInput.pendulumEphemeral.address, network: Networks.Pendulum },
    ];
    const additionalData = {
      walletAddress: executionInput.userWalletAddress,
      pixDestination: executionInput.pixId,
      taxId: executionInput.taxId,
      receiverTaxId: executionInput.taxId,
      brlaEvmAddress: executionInput.brlaEvmAddress,
    };
    const rampProcess = await RampService.registerRamp(quoteId, signingAccounts, additionalData);
    console.log('rampProcess', rampProcess);

    const signedTxs = await signUnsignedTransactions(
      rampProcess.unsignedTxs,
      {
        stellar: executionInput.stellarEphemeral,
        pendulum: executionInput.pendulumEphemeral,
      },
      apiComponents?.api,
    );
    console.log('signedTxs', signedTxs);

    setRampState({
      quote: executionInput.quote,
      ramp: rampProcess,
      signedTransactions: [],
      requiredUserActionsCompleted: false,
    });
  };

  useEffect(() => {
    if (!rampState?.ramp || !apiComponents?.api) {
      return;
    }

    // Check if we need to sign the transactions
    if (rampState.signedTransactions.length === 0) {
      // Group the transactions to be signed by the user vs ephemerals
      const { userTxs, ephemeralTxs } = rampState.ramp.unsignedTxs.reduce<{
        userTxs: UnsignedTx[];
        ephemeralTxs: UnsignedTx[];
      }>(
        (acc, tx) => {
          if (!address) {
            acc.ephemeralTxs.push(tx);
            return acc;
          }

          // Check on substrate networks
          console.log('tx.signer', tx.signer, 'address', address);
          const isUserTx =
            chainId < 0 && (tx.network === 'pendulum' || tx.network === 'assethub')
              ? getAddressForFormat(tx.signer, 0) === getAddressForFormat(address, 0)
              : tx.signer.toLowerCase() === address.toLowerCase();

          if (isUserTx) {
            acc.userTxs.push(tx);
          } else {
            acc.ephemeralTxs.push(tx);
          }

          return acc;
        },
        { userTxs: [], ephemeralTxs: [] },
      );

      // Sign all unsigned transactions with ephemerals
      signUnsignedTransactions(
        ephemeralTxs,
        {
          stellar: executionInput?.stellarEphemeral,
          pendulum: executionInput?.pendulumEphemeral,
          evm: executionInput?.moonbeamEphemeral,
        },
        apiComponents?.api,
      ).then((signedTransactions) => {
        console.log('Assigning signed transactions to ramp state');
        setRampState({
          ...rampState,
          signedTransactions,
        });

        // Kick off user signing process
        // TODO implement this
        setTimeout(() => {
          setRampState({
            ...rampState,
            requiredUserActionsCompleted: true,
          });
        }, 1000);
      });
    }
  }, [
    address,
    executionInput?.moonbeamEphemeral,
    executionInput?.pendulumEphemeral,
    executionInput?.stellarEphemeral,
    rampState,
    setRampState,
  ]);

  useEffect(() => {
    // Check if all prerequisites are met to start the ramp
    if (
      !rampState ||
      !rampState.ramp ||
      rampState.signedTransactions.length === 0 ||
      !rampState.requiredUserActionsCompleted
    ) {
      return;
    }

    // Call into the `startRamp` endpoint
    RampService.startRamp(rampState.ramp.id, rampState.signedTransactions).then((response) => {
      console.log('startRampResponse', response);

      // TODO set something on the state to indicate that the ramp has started
    });
  }, [rampState]);

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
