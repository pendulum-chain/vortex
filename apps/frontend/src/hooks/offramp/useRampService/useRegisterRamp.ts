import { getAddressForFormat, getOnChainTokenDetails } from "@packages/shared";
import { useCallback, useEffect } from "react";
import { useAssetHubNode, useMoonbeamNode, usePendulumNode } from "../../../contexts/polkadotNode";
import { usePolkadotWalletState } from "../../../contexts/polkadotWallet";
import { useRampActor } from "../../../contexts/rampState";
import { useToastMessage } from "../../../helpers/notifications";
import { RampService } from "../../../services/api";
import { MoneriumService } from "../../../services/api/monerium.service";
import { signAndSubmitEvmTransaction, signAndSubmitSubstrateTransaction } from "../../../services/transactions/userSigning";
import { useMoneriumStore } from "../../../stores/moneriumStore";
import { useRampExecutionInput, useRampStore, useSigningRejected } from "../../../stores/rampStore"; // Import useSigningRejected
import { useVortexAccount } from "../../useVortexAccount";

const RAMP_SIGNING_TRACE_KEY = "rampSigningTrace";

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
    return { canProceed: true };
  }, [traceKey]);

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
    actions: { setRampRegistered, setRampState, setRampSigningPhase, setCanRegisterRamp, setSigningRejected, resetRampState }
  } = useRampStore();
  const { showToast, ToastMessage } = useToastMessage();
  const rampActor = useRampActor();
  const { address, chainId, getMessageSignature } = useVortexAccount();
  const { apiComponents: pendulumApiComponents } = usePendulumNode();
  const { apiComponents: moonbeamApiComponents } = useMoonbeamNode();
  const { apiComponents: assethubApiComponents } = useAssetHubNode();
  const { walletAccount: substrateWalletAccount } = usePolkadotWalletState();

  const executionInput = useRampExecutionInput();

  useEffect(() => {
    if (rampActor && pendulumApiComponents && moonbeamApiComponents && assethubApiComponents) {
      rampActor.send({
        assethubApiComponents,
        moonbeamApiComponents,
        pendulumApiComponents,
        type: "SET_API_COMPONENTS"
      });
    }
  }, [rampActor, pendulumApiComponents, moonbeamApiComponents, assethubApiComponents]);

  // Get Monerium auth data
  const { authToken, triggered: moneriumTriggered } = useMoneriumStore();

  const { checkAndSetTrace: checkAndSetSigningTrace, releaseTrace: releaseSigningTrace } =
    useSignatureTrace(RAMP_SIGNING_TRACE_KEY);

  // XSTATE migration. This hook must go into the update and sign actor.

  // This hook is responsible for handling the user signing process once the ramp process is registered.
  // This is only relevant for offramps. @TODO: Extract this to a separate hook for offramp
  useEffect(() => {
    // Determine if conditions are met before filtering transactions
    const requiredMetaIsEmpty =
      (!rampState?.userSigningMeta?.squidRouterSwapHash && !rampState?.userSigningMeta?.assetHubToPendulumHash && !authToken) ||
      (!rampState?.userSigningMeta?.moneriumOnrampApproveHash && authToken);

    // If this is a Monerium offramp, we need to wait for a page refresh and the corresponding auth token.
    const waitForAuthToken = moneriumTriggered && !authToken;

    const shouldRequestSignatures =
      Boolean(rampState?.ramp) && // Ramp process data exists
      !rampStarted && // Ramp hasn't been started yet
      requiredMetaIsEmpty && // User signing metadata hasn't been populated yet
      chainId !== undefined; // Chain ID is available

    if (!rampState || !shouldRequestSignatures || waitForAuthToken || !rampRegistered) {
      return; // Exit early if conditions aren't met
    }

    // Create a signature trace for the signing process
    const traceResult = checkAndSetSigningTrace();
    if (!traceResult.canProceed) {
      console.log("Ramp signing trace already exists, skipping user signing process.");
      return;
    }
    console.log(`Starting user signing process at ${new Date().toISOString()}`);

    // XSTATE MIGRATION: This check should be on the "entry" action of the UpdateRamp state. An invoke probably.
    // Then a self-transition to the same state, but an internal state call "Sign". This internal machine should generically
    // handle a N number of transactions to be signed by the user.

    // Now filter the transactions after passing the main guard
    const userTxs = rampState?.ramp?.unsignedTxs.filter(tx => {
      if (!address) {
        return false;
      }

      return chainId < 0 && (tx.network === "pendulum" || tx.network === "assethub")
        ? getAddressForFormat(tx.signer, 0) === getAddressForFormat(address, 0)
        : tx.signer.toLowerCase() === address.toLowerCase();
    });

    // Add a check to ensure there are actually transactions for the user to sign
    if (userTxs?.length === 0) {
      console.log("No user transactions found requiring signature.");
      return;
    }

    console.log("Proceeding to request signatures from user...");

    // Kick off user signing process
    const requestSignaturesFromUser = async () => {
      let squidRouterApproveHash: string | undefined = undefined;
      let squidRouterSwapHash: string | undefined = undefined;
      let assetHubToPendulumHash: string | undefined = undefined;
      let moneriumOfframpSignature: string | undefined = undefined;
      let moneriumOnrampApproveHash: string | undefined = undefined;

      // Sign user transactions by nonce
      const sortedTxs = userTxs?.sort((a, b) => a.nonce - b.nonce);

      // Monerium signatures.
      // If Monerium offramp, prompt offramp message signature
      if (authToken && rampState?.ramp?.type === "off") {
        const offrampMessage = await MoneriumService.createRampMessage(rampState.quote.outputAmount, "THIS WILL BE THE IBAN");
        moneriumOfframpSignature = await getMessageSignature(offrampMessage);
      }

      if (!sortedTxs) {
        throw new Error("Missing sorted transactions");
      }

      const isNativeTokenTransfer = Boolean(
        executionInput?.onChainToken && getOnChainTokenDetails(executionInput.network, executionInput.onChainToken)?.isNative
      );

      for (const tx of sortedTxs) {
        // Approve is not necessary when transferring the native token
        if (tx.phase === "squidRouterApprove") {
          if (isNativeTokenTransfer) {
            // We don't care about the approve transaction when transferring native tokens
            // We set the signing phase to "login" as a hacky workaround to make sure that 1/1 is shown in the UI
            setRampSigningPhase("login");
            continue;
          }
          setRampSigningPhase("started");
          squidRouterApproveHash = await signAndSubmitEvmTransaction(tx);
          setRampSigningPhase("signed");
        } else if (tx.phase === "squidRouterSwap") {
          squidRouterSwapHash = await signAndSubmitEvmTransaction(tx);
          setRampSigningPhase("finished");
        } else if (tx.phase === "assethubToPendulum") {
          if (!substrateWalletAccount) {
            throw new Error("Missing substrateWalletAccount, user needs to be connected to a wallet account. ");
          }
          if (!assethubApiComponents?.api) {
            throw new Error("Missing assethubApiComponents. Assethub API is not available.");
          }
          setRampSigningPhase("started");
          assetHubToPendulumHash = await signAndSubmitSubstrateTransaction(
            tx,
            assethubApiComponents.api,
            substrateWalletAccount
          );
          setRampSigningPhase("finished");
        } else if (tx.phase === "moneriumOnrampSelfTransfer") {
          moneriumOnrampApproveHash = await signAndSubmitEvmTransaction(tx);
          setRampSigningPhase("finished");
        } else {
          throw new Error(`Unknown transaction received to be signed by user: ${tx.phase}`);
        }
      }

      // Update ramp with user-signed transactions and additional data
      const additionalData = {
        assetHubToPendulumHash,
        moneriumOfframpSignature,
        squidRouterApproveHash,
        squidRouterSwapHash
      };

      // Ramp must exist at this point.
      if (!rampState.ramp) {
        console.error("Ramp state is missing, cannot update ramp with user signatures.");
        throw new Error("Ramp state is missing, cannot update ramp with user signatures.");
      }
      const updatedRampProcess = await RampService.updateRamp(rampState.ramp.id, [], additionalData);

      setRampState({
        ...rampState,
        ramp: updatedRampProcess,
        userSigningMeta: {
          assetHubToPendulumHash,
          moneriumOnrampApproveHash,
          squidRouterApproveHash,
          squidRouterSwapHash
        }
      });
    };

    requestSignaturesFromUser()
      .then(() => {
        console.log("Done requesting signatures from user");
      })
      .catch(error => {
        console.error("Error requesting signatures from user", error);
        // TODO check if user declined based on error provided
        showToast(ToastMessage.SIGNING_REJECTED);
        setSigningRejected(true);
        resetRampState();
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
    ToastMessage.SIGNING_REJECTED,
    setSigningRejected,
    releaseSigningTrace,
    authToken,
    executionInput?.network,
    executionInput?.onChainToken,
    moneriumTriggered,
    getMessageSignature,
    resetRampState,
    rampRegistered
  ]);

  return {
    rampRegistered
  };
};
