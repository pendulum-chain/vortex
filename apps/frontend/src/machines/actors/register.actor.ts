import {
  AccountMeta,
  FiatToken,
  getAddressForFormat,
  Networks,
  RegisterRampRequest,
  signUnsignedTransactions
} from "@packages/shared";
import { config } from "../../config";
import { RampService } from "../../services/api";
import { RampState } from "../../types/phases";
import { RampContext } from "../types";

export const registerRampActor = async ({ input }: { input: RampContext }): Promise<RampState> => {
  const { executionInput, chainId, pendulumApiComponents, moonbeamApiComponents, address, authToken } = input;

  // TODO there should be a way to assert types in states, given transitions should ensure the type.
  if (!executionInput) {
    throw new Error("Execution input is required to register ramp.");
  }
  if (!pendulumApiComponents || !moonbeamApiComponents) {
    throw new Error("Pendulum and Moonbeam API components are required to register ramp.");
  }
  if (!chainId) {
    throw new Error("Chain ID is required to register ramp.");
  }

  const quoteId = executionInput.quote.id;
  const signingAccounts: AccountMeta[] = [
    {
      address: executionInput.ephemerals.stellarEphemeral.address,
      network: Networks.Stellar
    },
    {
      address: executionInput.ephemerals.moonbeamEphemeral.address,
      network: Networks.Moonbeam
    },
    {
      address: executionInput.ephemerals.pendulumEphemeral.address,
      network: Networks.Pendulum
    }
  ];

  let additionalData: RegisterRampRequest["additionalData"] = {};

  if (executionInput.quote.rampType === "on" && executionInput.fiatToken === FiatToken.BRL) {
    additionalData = {
      destinationAddress: address,
      taxId: executionInput.taxId
    };
  } else if (executionInput.quote.rampType === "on" && executionInput.fiatToken === FiatToken.EURC) {
    additionalData = {
      destinationAddress: address,
      moneriumAuthToken: authToken,
      taxId: executionInput.taxId
    };
  } else if (executionInput.quote.rampType === "off" && executionInput.fiatToken === FiatToken.BRL) {
    additionalData = {
      paymentData: executionInput.paymentData,
      pixDestination: executionInput.pixId,
      receiverTaxId: executionInput.taxId,
      taxId: executionInput.taxId,
      walletAddress: address
    };
  } else {
    additionalData = {
      moneriumAuthToken: authToken,
      paymentData: executionInput.paymentData,
      receiverTaxId: executionInput.taxId,
      taxId: executionInput.taxId,
      walletAddress: address
    };
  }

  const rampProcess = await RampService.registerRamp(quoteId, signingAccounts, additionalData);

  const ephemeralTxs = rampProcess.unsignedTxs.filter(tx => {
    if (!address) {
      return true;
    }

    return chainId < 0 && (tx.network === "pendulum" || tx.network === "assethub")
      ? getAddressForFormat(tx.signer, 0) !== getAddressForFormat(address, 0)
      : tx.signer.toLowerCase() !== address.toLowerCase();
  });

  const signedTransactions = await signUnsignedTransactions(
    ephemeralTxs,
    executionInput.ephemerals,
    pendulumApiComponents.api,
    moonbeamApiComponents.api,
    config.alchemyApiKey
  );

  const updatedRampProcess = await RampService.updateRamp(rampProcess.id, signedTransactions);

  const newRampState: RampState = {
    quote: executionInput.quote,
    ramp: updatedRampProcess,
    requiredUserActionsCompleted: false,
    signedTransactions,
    userSigningMeta: {
      assetHubToPendulumHash: undefined,
      moneriumOnrampApproveHash: undefined,
      squidRouterApproveHash: undefined,
      squidRouterSwapHash: undefined
    }
  };

  return newRampState;
};
