import {
  getAddressForFormat,
  getOnChainTokenDetails,
  isEvmTransactionData,
  isSignedTypedData,
  isSignedTypedDataArray,
  PresignedTx
} from "@vortexfi/shared";
import { RampService } from "../../services/api";
import { type DomainError, SentryDomain } from "../../services/api/api-client";
import {
  signAndSubmitEvmTransaction,
  signAndSubmitSubstrateTransaction,
  signMultipleTypedData
} from "../../services/transactions/userSigning";
import { RampContext, RampMachineActor, RampState } from "../types";

export enum SignRampErrorType {
  InvalidInput = "INVALID_INPUT",
  UserRejected = "USER_REJECTED",
  StartWindowClosed = "START_WINDOW_CLOSED",
  UnknownError = "UNKNOWN_ERROR"
}
export class SignRampError extends Error implements DomainError {
  type: SignRampErrorType;
  // Tagged as the wallet business area in Sentry's beforeSend.
  domain = SentryDomain.Wallet;
  constructor(message: string, type: SignRampErrorType) {
    super(message);
    this.type = type;
  }
}

// The API refuses to record or start a ramp after its start deadline, so funds broadcast later strand on the
// ephemeral. The margin covers the wallet confirmation, the receipt wait and the update/start calls.
const START_DEADLINE_MARGIN_MS = 4 * 60_000;

export const signTransactionsActor = async ({
  input
}: {
  input: { parent: RampMachineActor; context: RampContext };
}): Promise<RampState> => {
  const { rampState, connectedWalletAddress, chainId, executionInput, substrateWalletAccount } = input.context;

  if (!rampState || !connectedWalletAddress || chainId === undefined) {
    throw new SignRampError("Missing required context for signing", SignRampErrorType.InvalidInput);
  }

  const userTxs = rampState?.ramp?.unsignedTxs?.filter(tx => {
    const isSubstrateTransaction = !isEvmTransactionData(tx.txData);
    const signerAddress = connectedWalletAddress;

    if (!signerAddress) {
      return false;
    }

    const isSubstrateNetwork = chainId < 0 && isSubstrateTransaction;
    const match = isSubstrateNetwork
      ? getAddressForFormat(tx.signer, 0) === getAddressForFormat(signerAddress, 0)
      : tx.signer.toLowerCase() === signerAddress.toLowerCase();

    return match;
  });

  if (!userTxs || userTxs.length === 0) {
    console.log("No user transactions found requiring signature.");
    return rampState;
  }

  let squidRouterApproveHash: string | undefined = undefined;
  let squidRouterSwapHash: string | undefined = undefined;
  let squidRouterNoPermitTransferHash: string | undefined = undefined;
  let squidRouterNoPermitApproveHash: string | undefined = undefined;
  let squidRouterNoPermitSwapHash: string | undefined = undefined;
  let assethubToPendulumHash: string | undefined = undefined;

  const sortedTxs = userTxs?.sort((a, b) => a.nonce - b.nonce);

  if (!sortedTxs) {
    throw new SignRampError("Missing sorted transactions", SignRampErrorType.UnknownError);
  }

  const isNativeTokenTransfer = Boolean(
    executionInput?.onChainToken && getOnChainTokenDetails(executionInput.network, executionInput.onChainToken)?.isNative
  );

  const signedTxs: PresignedTx[] = rampState.signedTransactions;

  const total = sortedTxs.length;

  try {
    for (let idx = 0; idx < sortedTxs.length; idx++) {
      const tx = sortedTxs[idx];
      const current = idx + 1;

      // Typed-data permits move nothing until the backend executes them after a successful start.
      // The negated comparison fails closed when expiresAt is missing (NaN).
      const isBroadcast = !isSignedTypedData(tx.txData) && !isSignedTypedDataArray(tx.txData);
      if (isBroadcast && !(Date.parse(rampState.ramp?.expiresAt ?? "") - Date.now() > START_DEADLINE_MARGIN_MS)) {
        throw new SignRampError("Ramp start window closed before broadcast", SignRampErrorType.StartWindowClosed);
      }

      if (isSignedTypedData(tx.txData) || isSignedTypedDataArray(tx.txData)) {
        input.parent.send({ current, max: total, phase: "started", type: "SIGNING_UPDATE" });
        if (isSignedTypedData(tx.txData)) {
          const signedArray = await signMultipleTypedData([tx.txData]);
          tx.txData = signedArray[0];
        } else {
          tx.txData = await signMultipleTypedData(tx.txData);
        }

        signedTxs.push(tx);

        input.parent.send({ current, max: total, phase: "signed", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "squidRouterApprove") {
        if (isNativeTokenTransfer) {
          input.parent.send({ current, max: total, phase: "login", type: "SIGNING_UPDATE" });
          continue;
        }
        input.parent.send({ current, max: total, phase: "started", type: "SIGNING_UPDATE" });
        squidRouterApproveHash = await signAndSubmitEvmTransaction(tx);
        input.parent.send({ current, max: total, phase: "signed", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "squidRouterSwap") {
        squidRouterSwapHash = await signAndSubmitEvmTransaction(tx);
        input.parent.send({ current, max: total, phase: "finished", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "squidRouterNoPermitTransfer") {
        input.parent.send({ current, max: total, phase: "started", type: "SIGNING_UPDATE" });
        squidRouterNoPermitTransferHash = await signAndSubmitEvmTransaction(tx);
        input.parent.send({ current, max: total, phase: "finished", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "squidRouterNoPermitApprove") {
        input.parent.send({ current, max: total, phase: "started", type: "SIGNING_UPDATE" });
        squidRouterNoPermitApproveHash = await signAndSubmitEvmTransaction(tx);
        input.parent.send({ current, max: total, phase: "signed", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "squidRouterNoPermitSwap") {
        squidRouterNoPermitSwapHash = await signAndSubmitEvmTransaction(tx);
        input.parent.send({ current, max: total, phase: "finished", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "assethubToPendulum") {
        if (!substrateWalletAccount) {
          throw new Error("Missing substrateWalletAccount, user needs to be connected to a wallet account. ");
        }
        input.parent.send({ current, max: total, phase: "started", type: "SIGNING_UPDATE" });
        assethubToPendulumHash = await signAndSubmitSubstrateTransaction(tx, substrateWalletAccount);
        input.parent.send({ current, max: total, phase: "finished", type: "SIGNING_UPDATE" });
      } else {
        throw new Error(`Unknown transaction received to be signed by user: ${tx.phase}`);
      }
    }
  } catch (error) {
    console.log("Error during signing transactions: ", error);
    if (error instanceof SignRampError) {
      throw error;
    }
    // We try to catch an error caused by user rejection of the signature request.
    if (error instanceof Error && error.message) {
      if (error.message.includes("User rejected the request")) {
        throw new SignRampError("User rejected the signature request.", SignRampErrorType.UserRejected);
      }
      throw new SignRampError("Error signing transaction", SignRampErrorType.UnknownError);
    }
    throw new SignRampError("Error signing transaction", SignRampErrorType.UnknownError);
  }

  const additionalData = {
    assethubToPendulumHash,
    squidRouterApproveHash,
    squidRouterNoPermitApproveHash,
    squidRouterNoPermitSwapHash,
    squidRouterNoPermitTransferHash,
    squidRouterSwapHash
  };

  if (!rampState.ramp) {
    throw new Error("Ramp state is missing, cannot update ramp with user signatures.");
  }
  const updatedRampProcess = await RampService.updateRamp(rampState.ramp.id, signedTxs, additionalData);

  return {
    ...rampState,
    ramp: updatedRampProcess,
    userSigningMeta: {
      assethubToPendulumHash,
      squidRouterApproveHash,
      squidRouterSwapHash
    }
  };
};
