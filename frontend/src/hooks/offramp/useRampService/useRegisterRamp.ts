import { useRampExecutionInput, useRampStore } from '../../../stores/offrampStore';
import { useVortexAccount } from '../../useVortexAccount';
import { RampService } from '../../../services/api';
import { AccountMeta, FiatToken, getAddressForFormat, Networks, signUnsignedTransactions } from 'shared';
import { useAssetHubNode, useMoonbeamNode, usePendulumNode } from '../../../contexts/polkadotNode';
import { useEffect, useState } from 'react';
import {
  signAndSubmitEvmTransaction,
  signAndSubmitSubstrateTransaction,
} from '../../../services/transactions/userSigning';
import { usePolkadotWalletState } from '../../../contexts/polkadotWallet';
import { RampExecutionInput } from '../../../types/phases';
import { useAnchorWindowHandler } from '../useSEP24/useAnchorWindowHandler';
import { useSubmitOfframp } from '../useSubmitOfframp';

// For Offramp EUR/ARS we trigger it after returning from anchor window
// For Offramp/Onramp BRL we trigger it while clicking Continue in the ramp form

export const useRegisterRamp = () => {
  const {
    rampRegistered,
    rampState,
    rampStarted,
    actions: { setRampRegistered, setRampState, setRampSigningPhase },
  } = useRampStore();

  const { address } = useVortexAccount();
  const { chainId } = useVortexAccount();
  const { apiComponents: pendulumApiComponents } = usePendulumNode();
  const { apiComponents: moonbeamApiComponents } = useMoonbeamNode();
  const { apiComponents: assethubApiComponents } = useAssetHubNode();
  const { walletAccount: substrateWalletAccount } = usePolkadotWalletState();

  const prepareOfframpSubmission = useSubmitOfframp();
  const handleOnAnchorWindowOpen = useAnchorWindowHandler();

  // TODO if user declined signing, do something
  const [userDeclinedSigning, setUserDeclinedSigning] = useState(false);
  const [userSigningInProgress, setUserSigningInProgress] = useState(false);
  // This flag is used to track if the user signaled to start the ramp process
  const [canRegisterRamp, setCanRegisterRamp] = useState(false);

  const executionInput = useRampExecutionInput();

  const registerRamp = async (executionInput: RampExecutionInput) => {
    await prepareOfframpSubmission(executionInput);

    // For Stellar offramps, we need to prepare something in advance
    // Calling this function will result in eventually having the necessary prerequisites set
    if (executionInput.quote.rampType === 'off' && executionInput.fiatToken !== FiatToken.BRL) {
      console.log("Registering ramp for Stellar offramps");
      await handleOnAnchorWindowOpen();
    }

    // For other ramps, we can continue registering right away
    setCanRegisterRamp(true);
  };

  useEffect(() => {
    if (!canRegisterRamp) {
      return;
    }

    const registerRampProcess = async () => {
      if (!executionInput) {
        throw new Error('Missing execution input');
      }

      if (!chainId) {
        throw new Error('Missing chainId');
      }

      if (!pendulumApiComponents?.api) {
        throw new Error('Missing pendulumApiComponents');
      }

      if (!moonbeamApiComponents?.api) {
        throw new Error('Missing moonbeamApiComponents');
      }

      const quoteId = executionInput.quote.id;
      const signingAccounts: AccountMeta[] = [
        { address: executionInput.ephemerals.stellarEphemeral.address, network: Networks.Stellar },
        { address: executionInput.ephemerals.moonbeamEphemeral.address, network: Networks.Moonbeam },
        { address: executionInput.ephemerals.pendulumEphemeral.address, network: Networks.Pendulum },
      ];

      const additionalData =
        executionInput.quote.rampType === 'on'
          ? {
              destinationAddress: address,
              taxId: executionInput.taxId,
            }
          : {
              walletAddress: address,
              paymentData: executionInput.paymentData,
              taxId: executionInput.taxId,
              receiverTaxId: executionInput.taxId,
              pixDestination: executionInput.pixId,
            };

      console.log("Registering ramp with additional data:", additionalData);
      const rampProcess = await RampService.registerRamp(quoteId, signingAccounts, additionalData);
      console.log("Ramp process registered:", rampProcess);

      const ephemeralTxs = rampProcess.unsignedTxs.filter((tx) => {
        if (!address) {
          return true;
        }

        return chainId < 0 && (tx.network === 'pendulum' || tx.network === 'assethub')
          ? getAddressForFormat(tx.signer, 0) !== getAddressForFormat(address, 0)
          : tx.signer.toLowerCase() !== address.toLowerCase();
      });

      const signedTransactions = await signUnsignedTransactions(
        ephemeralTxs,
        executionInput.ephemerals,
        pendulumApiComponents.api,
        moonbeamApiComponents.api,
      );

      setRampRegistered(true);
      setRampState({
        quote: executionInput.quote,
        ramp: rampProcess,
        signedTransactions,
        requiredUserActionsCompleted: false,
        userSigningMeta: {
          squidRouterApproveHash: undefined,
          squidRouterSwapHash: undefined,
          assetHubToPendulumHash: undefined,
        },
      });
    };

    registerRampProcess().catch((error) => {
      console.error('Error registering ramp:', error);
    });
  }, [
    address,
    canRegisterRamp,
    chainId,
    executionInput,
    moonbeamApiComponents?.api,
    pendulumApiComponents?.api,
    setRampRegistered,
    setRampState,
  ]);

  // This hook is responsible for handling the user signing process once the ramp process is registered.
  // This is only relevant for offramps.
  useEffect(() => {
    // Determine if conditions are met before filtering transactions
    const requiredMetaIsEmpty =
      !rampState?.userSigningMeta?.squidRouterApproveHash &&
      !rampState?.userSigningMeta?.squidRouterSwapHash &&
      !rampState?.userSigningMeta?.assetHubToPendulumHash;

    const shouldRequestSignatures =
      Boolean(rampState?.ramp) && // Ramp process data exists
      !rampStarted && // Ramp hasn't been started yet
      requiredMetaIsEmpty && // User signing metadata hasn't been populated yet
      chainId !== undefined; // Chain ID is available

    if (
      !rampState ||
      rampState?.ramp?.type === 'on' ||
      !shouldRequestSignatures ||
      userSigningInProgress ||
      userDeclinedSigning
    ) {
      return; // Exit early if conditions aren't met
    }
    setUserSigningInProgress(true);

    // Now filter the transactions after passing the main guard
    const userTxs = rampState?.ramp?.unsignedTxs.filter((tx) => {
      if (!address) {
        return false;
      }

      return chainId < 0 && (tx.network === 'pendulum' || tx.network === 'assethub')
        ? getAddressForFormat(tx.signer, 0) === getAddressForFormat(address, 0)
        : tx.signer.toLowerCase() === address.toLowerCase();
    });

    // Add a check to ensure there are actually transactions for the user to sign
    if (userTxs?.length === 0) {
      console.log('No user transactions found requiring signature.');
      return;
    }

    console.log('Proceeding to request signatures from user...');

    // Kick off user signing process
    const requestSignaturesFromUser = async () => {
      let squidRouterApproveHash: string | undefined = undefined;
      let squidRouterSwapHash: string | undefined = undefined;
      let assetHubToPendulumHash: string | undefined = undefined;

      // Sign user transactions by nonce
      const sortedTxs = userTxs?.sort((a, b) => a.nonce - b.nonce);

      for (const tx of sortedTxs!) {
        if (tx.phase === 'squidrouterApprove') {
          setRampSigningPhase('started');
          squidRouterApproveHash = await signAndSubmitEvmTransaction(tx);
          setRampSigningPhase('signed');
        } else if (tx.phase === 'squidrouterSwap') {
          squidRouterSwapHash = await signAndSubmitEvmTransaction(tx);
          setRampSigningPhase('finished');
        } else if (tx.phase === 'assethubToPendulum') {
          if (!substrateWalletAccount) {
            throw new Error('Missing substrateWalletAccount, user needs to be connected to a wallet account. ');
          }
          if (!assethubApiComponents?.api) {
            throw new Error('Missing assethubApiComponents. Assethub API is not available.');
          }
          setRampSigningPhase('started');
          assetHubToPendulumHash = await signAndSubmitSubstrateTransaction(
            tx,
            assethubApiComponents.api,
            substrateWalletAccount,
          );
          setRampSigningPhase('finished');
        } else {
          throw new Error(`Unknown transaction received to be signed by user: ${tx.phase}`);
        }
      }

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
      })
      .catch((error) => {
        console.error('Error requesting signatures from user', error);
        // TODO check if user declined based on error provided
        // For now, assume it failed because the user declined
        setUserDeclinedSigning(true);
      })
      .finally(() => setUserSigningInProgress(false));
  }, [
    address,
    assethubApiComponents?.api,
    chainId,
    rampStarted,
    rampState,
    setRampSigningPhase,
    setRampState,
    substrateWalletAccount,
    userDeclinedSigning,
    userSigningInProgress,
  ]);

  return {
    registerRamp,
    rampRegistered,
  };
};
