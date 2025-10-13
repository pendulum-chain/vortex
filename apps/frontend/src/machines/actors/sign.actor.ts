import { getAddressForFormat, getOnChainTokenDetails, Networks, RampDirection } from "@packages/shared";
import { RampService } from "../../services/api";
import { MoneriumService } from "../../services/api/monerium.service";
import { PolkadotNodeName, polkadotApiService } from "../../services/api/polkadot.service";
import { signAndSubmitEvmTransaction, signAndSubmitSubstrateTransaction } from "../../services/transactions/userSigning";
import { RampContext, RampMachineActor, RampState } from "../types";

export enum SignRampErrorType {
  InvalidInput = "INVALID_INPUT",
  UserRejected = "USER_REJECTED",
  UnknownError = "UNKNOWN_ERROR"
}
export class SignRampError extends Error {
  type: SignRampErrorType;
  constructor(message: string, type: SignRampErrorType) {
    super(message);
    this.type = type;
  }
}

export const signTransactionsActor = async ({
  input
}: {
  input: { parent: RampMachineActor; context: RampContext };
}): Promise<RampState> => {
  const { rampState, rampDirection, quote, address, chainId, executionInput, substrateWalletAccount, getMessageSignature } =
    input.context;

  if (!rampState || !address || chainId === undefined) {
    throw new SignRampError("Missing required context for signing", SignRampErrorType.InvalidInput);
  }

  const userTxs = rampState?.ramp?.unsignedTxs.filter(tx => {
    // If a monerium wallet address is provided in the execution input, we use that as the signer address.
    const signerAddress = executionInput?.moneriumWalletAddress || address;
    if (!signerAddress) {
      return false;
    }

    return chainId < 0 && (tx.network === Networks.Pendulum || tx.network === Networks.AssetHub)
      ? getAddressForFormat(tx.signer, 0) === getAddressForFormat(signerAddress, 0)
      : tx.signer.toLowerCase() === signerAddress.toLowerCase();
  });

  if (!userTxs || userTxs.length === 0) {
    console.log("No user transactions found requiring signature.");
    return rampState;
  }

  let squidRouterApproveHash: string | undefined = undefined;
  let squidRouterSwapHash: string | undefined = undefined;
  let assethubToPendulumHash: string | undefined = undefined;
  let moneriumOfframpSignature: string | undefined = undefined;
  let moneriumOnrampApproveHash: string | undefined = undefined;

  const sortedTxs = userTxs?.sort((a, b) => a.nonce - b.nonce);

  // Monerium onramp
  if (rampDirection === RampDirection.SELL && quote?.from === "sepa") {
    if (!getMessageSignature) throw new Error("getMessageSignature not available");
    const offrampMessage = await MoneriumService.createRampMessage(rampState.quote.outputAmount, "THIS WILL BE THE IBAN");
    moneriumOfframpSignature = await getMessageSignature(offrampMessage);
  }

  if (!sortedTxs) {
    throw new SignRampError("Missing sorted transactions", SignRampErrorType.UnknownError);
  }

  const isNativeTokenTransfer = Boolean(
    executionInput?.onChainToken && getOnChainTokenDetails(executionInput.network, executionInput.onChainToken)?.isNative
  );

  try {
    for (const tx of sortedTxs) {
      if (tx.phase === "squidRouterApprove") {
        if (isNativeTokenTransfer) {
          input.parent.send({ phase: "login", type: "SIGNING_UPDATE" });
          continue;
        }
        input.parent.send({ phase: "started", type: "SIGNING_UPDATE" });
        squidRouterApproveHash = await signAndSubmitEvmTransaction(tx);
        input.parent.send({ phase: "signed", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "squidRouterSwap") {
        squidRouterSwapHash = await signAndSubmitEvmTransaction(tx);
        input.parent.send({ phase: "finished", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "assethubToPendulum") {
        if (!substrateWalletAccount) {
          throw new Error("Missing substrateWalletAccount, user needs to be connected to a wallet account. ");
        }
        const assethubApiComponents = await polkadotApiService.getApi(PolkadotNodeName.AssetHub);
        if (!assethubApiComponents?.api) {
          throw new Error("Missing assethubApiComponents. Assethub API is not available.");
        }
        input.parent.send({ phase: "started", type: "SIGNING_UPDATE" });
        assethubToPendulumHash = await signAndSubmitSubstrateTransaction(tx, assethubApiComponents.api, substrateWalletAccount);
        input.parent.send({ phase: "finished", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "moneriumOnrampSelfTransfer") {
        input.parent.send({ phase: "login", type: "SIGNING_UPDATE" });
        moneriumOnrampApproveHash = await signAndSubmitEvmTransaction(tx);
        input.parent.send({ phase: "finished", type: "SIGNING_UPDATE" });
      } else {
        throw new Error(`Unknown transaction received to be signed by user: ${tx.phase}`);
      }
    }
  } catch (error) {
    console.log("Error during signing transactions: ", error);
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
    moneriumOfframpSignature,
    squidRouterApproveHash,
    squidRouterSwapHash
  };

  if (!rampState.ramp) {
    throw new Error("Ramp state is missing, cannot update ramp with user signatures.");
  }
  const updatedRampProcess = await RampService.updateRamp(rampState.ramp.id, [], additionalData);

  return {
    ...rampState,
    ramp: updatedRampProcess,
    userSigningMeta: {
      assethubToPendulumHash,
      moneriumOnrampApproveHash,
      squidRouterApproveHash,
      squidRouterSwapHash
    }
  };
};
