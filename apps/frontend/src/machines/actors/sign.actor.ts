import { getAddressForFormat, getOnChainTokenDetails, RampProcess } from "@packages/shared";
import { ActorRefFrom } from "xstate";
import { RampService } from "../../services/api";
import { MoneriumService } from "../../services/api/monerium.service";
import { PolkadotNodeName, polkadotApiService } from "../../services/api/polkadot.service";
import { signAndSubmitEvmTransaction, signAndSubmitSubstrateTransaction } from "../../services/transactions/userSigning";
import { rampMachine } from "../ramp.machine";
import { RampContext, RampMachineActor, RampState } from "../types";

export const signTransactionsActor = async ({
  input
}: {
  input: { parent: RampMachineActor; context: RampContext };
}): Promise<RampState> => {
  const { rampState, address, chainId, authToken, executionInput, substrateWalletAccount, getMessageSignature } = input.context;

  if (!rampState || !address || chainId === undefined) {
    throw new Error("Missing required context for signing");
  }

  const userTxs = rampState?.ramp?.unsignedTxs.filter(tx => {
    if (!address) {
      return false;
    }

    return chainId < 0 && (tx.network === "pendulum" || tx.network === "assethub")
      ? getAddressForFormat(tx.signer, 0) === getAddressForFormat(address, 0)
      : tx.signer.toLowerCase() === address.toLowerCase();
  });

  if (!userTxs || userTxs.length === 0) {
    console.log("No user transactions found requiring signature.");
    return rampState;
  }

  let squidRouterApproveHash: string | undefined = undefined;
  let squidRouterSwapHash: string | undefined = undefined;
  let assetHubToPendulumHash: string | undefined = undefined;
  let moneriumOfframpSignature: string | undefined = undefined;
  let moneriumOnrampApproveHash: string | undefined = undefined;

  const sortedTxs = userTxs?.sort((a, b) => a.nonce - b.nonce);

  if (authToken && rampState?.ramp?.type === "off") {
    if (!getMessageSignature) throw new Error("getMessageSignature not available");
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
      assetHubToPendulumHash = await signAndSubmitSubstrateTransaction(tx, assethubApiComponents.api, substrateWalletAccount);
      input.parent.send({ phase: "finished", type: "SIGNING_UPDATE" });
    } else if (tx.phase === "moneriumOnrampSelfTransfer") {
      input.parent.send({ phase: "login", type: "SIGNING_UPDATE" });
      moneriumOnrampApproveHash = await signAndSubmitEvmTransaction(tx);
      input.parent.send({ phase: "finished", type: "SIGNING_UPDATE" });
    } else {
      throw new Error(`Unknown transaction received to be signed by user: ${tx.phase}`);
    }
  }

  const additionalData = {
    assetHubToPendulumHash,
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
      assetHubToPendulumHash,
      moneriumOnrampApproveHash,
      squidRouterApproveHash,
      squidRouterSwapHash
    }
  };
};
