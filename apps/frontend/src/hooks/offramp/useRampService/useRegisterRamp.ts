import {
  AccountMeta,
  EvmTransactionData,
  FiatToken,
  Networks,
  PresignedTx,
  getAddressForFormat,
  signUnsignedTransactions,
} from '@packages/shared';
import { getAccount, getWalletClient } from '@wagmi/core';
import { useCallback, useEffect } from 'react';
import { signTransaction } from 'viem/accounts';
import { useAssetHubNode, useMoonbeamNode, usePendulumNode } from '../../../contexts/polkadotNode';
import { usePolkadotWalletState } from '../../../contexts/polkadotWallet';
import { useToastMessage } from '../../../helpers/notifications';
import { RampService } from '../../../services/api';
import { MoneriumService } from '../../../services/api/monerium.service';
import {
  signAndSubmitEvmTransaction,
  signAndSubmitSubstrateTransaction,
} from '../../../services/transactions/userSigning';
import { useMoneriumStore } from '../../../stores/moneriumStore';
import { useRampExecutionInput, useRampStore, useSigningRejected } from '../../../stores/rampStore'; // Import useSigningRejected
import { RampExecutionInput } from '../../../types/phases';
import { wagmiConfig } from '../../../wagmiConfig';
import { useVortexAccount } from '../../useVortexAccount';
import { useAnchorWindowHandler } from '../useSEP24/useAnchorWindowHandler';
import { useSubmitRamp } from '../useSubmitRamp';

const RAMP_REGISTER_TRACE_KEY = 'rampRegisterTrace';
const RAMP_SIGNING_TRACE_KEY = 'rampSigningTrace';

/**
 * A utility hook to manage signature traces using localStorage.
 * This prevents a process from running more than once.
 */
const useSignatureTrace = (traceKey: string) => {
  // Checks if a trace exists. If not, it creates one and allows the process to proceed.
  const checkAndSetTrace = useCallback(() => {
    const existingTrace = localStorage.getItem(traceKey);
    if (existingTrace !== null) {
      return { canProceed: false };
    }

    const traceRef = new Date().toISOString();
    localStorage.setItem(traceKey, traceRef);
    console.log(`Signature trace for ${traceKey} created.`);
    return { canProceed: true };
  }, [traceKey]);

  // Releases the lock when the process is complete
  const releaseTrace = useCallback(() => {
    localStorage.removeItem(traceKey);
  }, [traceKey]);

  return { checkAndSetTrace, releaseTrace };
};

// For Offramp EUR/ARS we trigger it after returning from anchor window
// For Offramp/Onramp BRL we trigger it while clicking Continue in the ramp form
export const useRegisterRamp = () => {
  const {
    rampRegistered,
    rampState,
    rampStarted,
    canRegisterRamp,
    rampKycStarted,
    actions: { setRampRegistered, setRampState, setRampSigningPhase, setCanRegisterRamp, setSigningRejected },
  } = useRampStore();
  const { showToast, ToastMessage } = useToastMessage();

  const { address, chainId, getMessageSignature } = useVortexAccount();
  const { apiComponents: pendulumApiComponents } = usePendulumNode();
  const { apiComponents: moonbeamApiComponents } = useMoonbeamNode();
  const { apiComponents: assethubApiComponents } = useAssetHubNode();
  const { walletAccount: substrateWalletAccount } = usePolkadotWalletState();

  const executionInput = useRampExecutionInput();
  const prepareRampSubmission = useSubmitRamp();
  const handleOnAnchorWindowOpen = useAnchorWindowHandler();
  const signingRejected = useSigningRejected();

  // Get Monerium auth data
  const { authToken, codeVerifier, triggered: moneriumTriggered } = useMoneriumStore();

  // This should be called for onramps, when the user opens the summary dialog, and for offramps, when the user
  // clicks on the Continue button in the form (BRL) or comes back from the anchor page.
  const registerRamp = async (executionInput: RampExecutionInput) => {
    prepareRampSubmission(executionInput);

    // For Stellar offramps, we need to prepare something in advance
    // Calling this function will result in eventually having the necessary prerequisites set
    if (executionInput.quote.rampType === 'off' && executionInput.fiatToken !== FiatToken.BRL) {
      console.log('Registering ramp for Stellar offramps');
      await handleOnAnchorWindowOpen();
    }

    if (executionInput.quote.rampType === 'off' && executionInput.fiatToken === FiatToken.BRL) {
      // Waiting for user input (the ramp summary dialog should show the 'Confirm' button and once clicked,
      // We setCanRegisterRamp to true inside of the RampSummaryButton
    } else {
      // For other ramps, we can continue registering right away
      setCanRegisterRamp(true);
    }
  };

  const { checkAndSetTrace: checkAndSetRegisterTrace, releaseTrace: releaseRegisterTrace } =
    useSignatureTrace(RAMP_REGISTER_TRACE_KEY);
  const { checkAndSetTrace: checkAndSetSigningTrace, releaseTrace: releaseSigningTrace } =
    useSignatureTrace(RAMP_SIGNING_TRACE_KEY);

  // @TODO: maybe change to useCallback
  useEffect(() => {
    const registerRampProcess = async () => {
      if (rampRegistered) {
        return;
      }

      if (signingRejected) {
        throw new Error('Signing was rejected, cannot proceed with ramp registration');
      }

      if (rampKycStarted) {
        throw new Error('KYC is not valid yet');
      }

      if (!canRegisterRamp) {
        throw new Error('Cannot proceed with ramp registration, canRegisterRamp is false');
      }

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
        {
          address: executionInput.ephemerals.stellarEphemeral.address,
          network: Networks.Stellar,
        },
        {
          address: executionInput.ephemerals.moonbeamEphemeral.address,
          network: Networks.Moonbeam,
        },
        {
          address: executionInput.ephemerals.pendulumEphemeral.address,
          network: Networks.Pendulum,
        },
      ];

      if (executionInput.quote.rampType === 'on' && executionInput.fiatToken === FiatToken.EURC && !authToken) {
        // If this is an onramp with Monerium EURC, we need to wait for the auth token
        console.log('Waiting for Monerium auth token before proceeding with ramp registration');
        return; // Exit early, we will retry once the auth token is available
      }

      if (executionInput.quote.rampType === 'off' && executionInput.fiatToken !== FiatToken.BRL && !authToken) {
        // Checks for Stellar offramps
        if (!executionInput.ephemerals.stellarEphemeral.secret) {
          throw new Error('Missing Stellar ephemeral secret');
        }
        if (!executionInput.paymentData) {
          throw new Error('Missing payment data for Stellar offramps');
        }
      }

      // Build additional data based on ramp type and currency

      let additionalData: any = {};

      if (executionInput.quote.rampType === 'on' && executionInput.fiatToken === FiatToken.BRL) {
        additionalData = {
          destinationAddress: address,
          taxId: executionInput.taxId,
        };
      } else if (executionInput.quote.rampType === 'on' && executionInput.fiatToken === FiatToken.EURC) {
        additionalData = {
          destinationAddress: address,
          taxId: executionInput.taxId,
          moneriumAuthToken: authToken,
        };
      } else if (executionInput.quote.rampType === 'off' && executionInput.fiatToken === FiatToken.BRL) {
        additionalData = {
          walletAddress: address,
          paymentData: executionInput.paymentData,
          taxId: executionInput.taxId,
          receiverTaxId: executionInput.taxId,
          pixDestination: executionInput.taxId,
        };
      } else {
        // For other ramps, we can use the address directly
        additionalData = {
          walletAddress: address,
          paymentData: executionInput.paymentData,
          taxId: executionInput.taxId,
          receiverTaxId: executionInput.taxId,
          moneriumAuthToken: authToken,
        };
      }

      // Create a signature trace for the registration process
      const traceResult = checkAndSetRegisterTrace();
      if (!traceResult.canProceed) {
        return;
      }
      const rampProcess = await RampService.registerRamp(quoteId, signingAccounts, additionalData);
      console.log(`Ramp process registered:`, rampProcess);

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

      // Update ramp with ephemeral signed transactions
      const updatedRampProcess = await RampService.updateRamp(rampProcess.id, signedTransactions);

      setRampRegistered(true);
      setRampState({
        quote: executionInput.quote,
        ramp: updatedRampProcess,
        signedTransactions,
        requiredUserActionsCompleted: false,
        userSigningMeta: {
          squidRouterApproveHash: undefined,
          squidRouterSwapHash: undefined,
          assetHubToPendulumHash: undefined,
        },
      });
    };

    registerRampProcess()
      .catch((error) => {
        console.error(`Error registering ramp:`, error);
      })
      .finally(() => {
        // Release the registration trace lock
        releaseRegisterTrace();
      });
  }, [
    address,
    canRegisterRamp,
    chainId,
    checkAndSetRegisterTrace,
    releaseRegisterTrace,
    executionInput,
    moonbeamApiComponents?.api,
    pendulumApiComponents?.api,
    setRampRegistered,
    setRampState,
    rampKycStarted,
    rampStarted,
    setSigningRejected,
    showToast,
    signingRejected,
    ToastMessage.SIGNING_REJECTED,
    authToken,
    codeVerifier,
  ]);

  // This hook is responsible for handling the user signing process once the ramp process is registered.
  // This is only relevant for offramps. @TODO: Extract this to a separate hook for offramp
  useEffect(() => {
    // Determine if conditions are met before filtering transactions
    const requiredMetaIsEmpty =
      !rampState?.userSigningMeta?.squidRouterApproveHash &&
      !rampState?.userSigningMeta?.squidRouterSwapHash &&
      !rampState?.userSigningMeta?.assetHubToPendulumHash;

    // If this is a Monerium offramp, we need to wait for a page refresh and the corresponding auth token.
    const waitForAuthToken = moneriumTriggered && !authToken;

    const shouldRequestSignatures =
      Boolean(rampState?.ramp) && // Ramp process data exists
      !rampStarted && // Ramp hasn't been started yet
      requiredMetaIsEmpty && // User signing metadata hasn't been populated yet
      chainId !== undefined; // Chain ID is available

    if (!rampState || !shouldRequestSignatures || signingRejected || waitForAuthToken) {
      return; // Exit early if conditions aren't met
    }

    // Create a signature trace for the signing process
    const traceResult = checkAndSetSigningTrace();
    if (!traceResult.canProceed) {
      console.log(`Ramp signing trace already exists, skipping user signing process.`);
      return;
    }
    console.log(`Starting user signing process at ${new Date().toISOString()}`);

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
      console.log(`No user transactions found requiring signature.`);
      return;
    }

    console.log(`Proceeding to request signatures from user...`);

    // Kick off user signing process
    const requestSignaturesFromUser = async () => {
      let squidRouterApproveHash: string | undefined = undefined;
      let squidRouterSwapHash: string | undefined = undefined;
      let assetHubToPendulumHash: string | undefined = undefined;
      let moneriumOfframpSignature: string | undefined = undefined;
      let moneriumOnrampSignedTransaction: PresignedTx | undefined = undefined;

      // Sign user transactions by nonce
      const sortedTxs = userTxs?.sort((a, b) => a.nonce - b.nonce);

      // Monerium signatures.
      // If Monerium offramp, prompt offramp message signature
      if (authToken && rampState?.ramp?.type === 'off') {
        const offrampMessage = await MoneriumService.createRampMessage(
          rampState.quote.outputAmount,
          'THIS WILL BE THE IBAN',
        );
        moneriumOfframpSignature = await getMessageSignature(offrampMessage);
      }

      const walletClient = await getWalletClient(wagmiConfig);
      console.log(`Wallet client for signing:`, walletClient.account);
      for (const tx of sortedTxs!) {
        if (tx.phase === 'squidRouterApprove') {
          setRampSigningPhase('started');
          squidRouterApproveHash = await signAndSubmitEvmTransaction(tx);
          setRampSigningPhase('signed');
        } else if (tx.phase === 'squidRouterSwap') {
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
        } else if (tx.phase === 'moneriumOnrampInitialTransfer') {
          setRampSigningPhase('started');
          console.log(`Signing Monerium onramp transaction:`, tx);

          try {
            const evmTransaction = tx.txData as EvmTransactionData;
            console.log(`EVM Transaction to sign:`, evmTransaction);
            const signedTxData = await walletClient.signTransaction({
              to: evmTransaction.to as `0x${string}`,
              account: walletClient.account,
              data: evmTransaction.data,
              value: BigInt(evmTransaction.value),
              nonce: 0,
              chain: walletClient.chain,
            });

            moneriumOnrampSignedTransaction = {
              ...tx,
              txData: signedTxData,
            };
          } catch (error) {
            console.error(`Error signing Monerium onramp transaction:`, error);
            throw new Error(`Failed to sign Monerium onramp transaction: ${error}`);
          }
          setRampSigningPhase('signed');
        } else {
          throw new Error(`Unknown transaction received to be signed by user: ${tx.phase}`);
        }
      }

      // Update ramp with user-signed transactions and additional data
      const additionalData = {
        squidRouterApproveHash,
        squidRouterSwapHash,
        assetHubToPendulumHash,
        moneriumOfframpSignature,
      };

      // Only additional presigned transaction if Monerium onramp
      const extraPresignedTxs: PresignedTx[] = moneriumOnrampSignedTransaction ? [moneriumOnrampSignedTransaction] : [];

      const updatedRampProcess = await RampService.updateRamp(rampState.ramp!.id, extraPresignedTxs, additionalData);

      setRampState({
        ...rampState,
        ramp: updatedRampProcess,
        userSigningMeta: {
          squidRouterApproveHash,
          squidRouterSwapHash,
          assetHubToPendulumHash,
        },
      });
    };

    requestSignaturesFromUser()
      .then(() => {
        console.log(`Done requesting signatures from user`);
      })
      .catch((error) => {
        console.error(`Error requesting signatures from user`, error);
        // TODO check if user declined based on error provided
        showToast(ToastMessage.SIGNING_REJECTED);
        setSigningRejected(true);
      })
      .finally(() => releaseSigningTrace());
  }, [
    address,
    assethubApiComponents?.api,
    chainId,
    checkAndSetSigningTrace,
    rampStarted,
    rampState,
    setRampSigningPhase,
    setRampState,
    substrateWalletAccount,
    showToast,
    signingRejected,
    ToastMessage.SIGNING_REJECTED,
    setSigningRejected,
    releaseSigningTrace,
    authToken,
  ]);

  return {
    registerRamp,
    rampRegistered,
  };
};
