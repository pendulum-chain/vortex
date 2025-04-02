import { useSubmitOfframp } from './useSubmitOfframp';
import { useOfframpEvents } from './useOfframpEvents';
import { useRampExecutionInput, useRampSigningPhase, useRampStore } from '../../stores/offrampStore';
import { useSep24Actions, useSep24InitialResponse, useSep24UrlInterval } from '../../stores/sep24Store';
import { useAnchorWindowHandler } from './useSEP24/useAnchorWindowHandler';
import { useVortexAccount } from '../useVortexAccount';
import { RampService } from '../../services/api';
import { AccountMeta, getAddressForFormat, Networks, UnsignedTx } from 'shared';
import { signUnsignedTransactions, signUserTransaction } from '../../services/api/pre-signature';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { useEffect, useState } from 'react';

export const useMainProcess = () => {
  const {
    rampRegistered,
    rampState,
    rampStarted,
    actions: { resetRampState, setRampStarted, setRampRegistered, setRampState, setRampSigningPhase },
  } = useRampStore();
  const executionInput = useRampExecutionInput();
  const { address, chainId } = useVortexAccount();
  const { apiComponents } = usePendulumNode();

  // States to prevent double execution of hooks
  const [preparingTransactions, setPreparingTransactions] = useState<boolean>(false);
  const [startingRamp, setStartingRamp] = useState<boolean>(false);
  const [userTransactionsSigned, setUserTransactionsSigned] = useState<boolean>(false);

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

    if (!apiComponents?.api) {
      throw new Error('Missing apiComponents');
    }

    const quoteId = executionInput.quote.id;
    const signingAccounts: AccountMeta[] = [
      { address: executionInput.ephemerals.stellarEphemeral.address, network: Networks.Stellar },
      { address: executionInput.ephemerals.pendulumEphemeral.address, network: Networks.Pendulum },
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
      executionInput.ephemerals,
      apiComponents?.api,
    );
    console.log('signedTxs', signedTxs);

    setRampRegistered(true);
    setRampState({
      quote: executionInput.quote,
      ramp: rampProcess,
      signedTransactions: [],
      requiredUserActionsCompleted: false,
      userSigningMeta: {
        squidRouterApproveHash: undefined,
        squidRouterSwapHash: undefined,
        assetHubToPendulumHash: undefined,
      },
    });
  };

  useEffect(() => {
    if (preparingTransactions || (rampRegistered && rampStarted)) {
      return;
    }
    if (!rampState?.ramp || !apiComponents?.api || !executionInput || !chainId) {
      return;
    }
    setPreparingTransactions(true);

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

          const isUserTx =
            chainId < 0 && (tx.network === 'pendulum' || tx.network === 'assethub')
              ? // Convert to same address format for comparison
                getAddressForFormat(tx.signer, 0) === getAddressForFormat(address, 0)
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
      signUnsignedTransactions(ephemeralTxs, executionInput.ephemerals, apiComponents?.api).then(
        (signedTransactions) => {
          console.log('Assigning signed transactions to ramp state');
          setRampState({
            ...rampState,
            signedTransactions,
          });
        },
      );

      // Kick off user signing process
      const requestSignaturesFromUser = async () => {
        let squidRouterApproveHash: string | undefined = undefined;
        let squidRouterSwapHash: string | undefined = undefined;
        let assetHubToPendulumHash: string | undefined = undefined;

        // Sign user transactions by nonce
        const sortedTxs = userTxs.sort((a, b) => a.nonce - b.nonce);

        console.log('sortedTxs', sortedTxs);

        for (const tx of sortedTxs) {
          if (tx.phase === 'squidrouterApprove') {
            setRampSigningPhase('started');
            squidRouterApproveHash = await signUserTransaction(tx);
            setRampSigningPhase('approved');
          } else if (tx.phase === 'squidrouterSwap') {
            squidRouterSwapHash = await signUserTransaction(tx);
            setRampSigningPhase('finished');
          } else if (tx.phase === 'assethubToPendulum') {
            setRampSigningPhase('started');
            assetHubToPendulumHash = await signUserTransaction(tx);
            setRampSigningPhase('finished');
          } else {
            throw new Error(`Unknown transaction received to be signed by user: ${tx.phase}`);
          }
        }

        console.log("squidRouterApproveHash", squidRouterApproveHash);
        console.log("squidRouterSwapHash", squidRouterSwapHash);
        console.log("assetHubToPendulumHash", assetHubToPendulumHash);

        setRampState({
          ...rampState,
          userSigningMeta: {
            squidRouterApproveHash,
            squidRouterSwapHash,
            assetHubToPendulumHash,
          },
        });
      };
      requestSignaturesFromUser()
        .then(() => {
          console.log('Done requesting signatures from user');
          setUserTransactionsSigned(true);
        })
        .catch((error) => console.error('Error requesting signatures from user', error))
        .finally(() => setPreparingTransactions(false));
    }
  }, [
    address,
    apiComponents?.api,
    chainId,
    executionInput,
    preparingTransactions,
    rampRegistered,
    rampStarted,
    rampState,
    setRampSigningPhase,
    setRampState,
  ]);

  useEffect(() => {
    // Check if all prerequisites are met to start the ramp
    if (
      !userTransactionsSigned ||
      startingRamp ||
      rampStarted ||
      !rampState?.ramp ||
      rampState.signedTransactions.length === 0
    ) {
      return;
    }
    setStartingRamp(true);

    // Call into the `startRamp` endpoint
    RampService.startRamp(rampState.ramp.id, rampState.signedTransactions, rampState.userSigningMeta)
      .then((response) => {
        console.log('startRampResponse', response);
        setRampStarted(true);
      })
      .catch((err) => {
        console.error('Error starting ramp:', err);
      })
      .finally(() => setStartingRamp(false));
  }, [rampStarted, rampState, setRampStarted, startingRamp, userTransactionsSigned]);

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
