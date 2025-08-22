import {
  AccountMeta,
  FiatToken,
  getAddressForFormat,
  Networks,
  RampDirection,
  RegisterRampRequest,
  signUnsignedTransactions
} from "@packages/shared";
import { config } from "../../config";
import { moonbeamApiService, pendulumApiService, RampService } from "../../services/api";
import { RampState } from "../../types/phases";
import { RampContext } from "../types";

export enum RegisterRampErrorType {
  InvalidInput = "INVALID_INPUT"
}

export class RegisterRampError extends Error {
  type: RegisterRampErrorType;
  constructor(message: string, type: RegisterRampErrorType) {
    super(message);
    this.type = type;
  }
}

export const registerRampActor = async ({ input }: { input: RampContext }): Promise<RampState> => {
  const { executionInput, chainId, address, authToken, paymentData } = input;

  console.log("Registering ramp with input:", input);

  // TODO there should be a way to assert types in states, given transitions should ensure the type.
  if (!executionInput) {
    throw new RegisterRampError("Execution input is required to register ramp.", RegisterRampErrorType.InvalidInput);
  }
  const pendulumApiComponents = await pendulumApiService.getApi();
  const moonbeamApiComponents = await moonbeamApiService.getApi();
  if (!chainId) {
    throw new RegisterRampError("Chain ID is required to register ramp.", RegisterRampErrorType.InvalidInput);
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

  if (executionInput.quote.rampType === RampDirection.BUY && executionInput.fiatToken === FiatToken.BRL) {
    additionalData = {
      destinationAddress: address,
      taxId: executionInput.taxId
    };
  } else if (executionInput.quote.rampType === RampDirection.BUY && executionInput.fiatToken === FiatToken.EURC) {
    additionalData = {
      destinationAddress: address,
      moneriumAuthToken: authToken
    };
  } else if (executionInput.quote.rampType === RampDirection.SELL && executionInput.fiatToken === FiatToken.BRL) {
    additionalData = {
      pixDestination: executionInput.pixId,
      receiverTaxId: executionInput.taxId,
      taxId: executionInput.taxId,
      walletAddress: address
    };
  } else {
    additionalData = {
      // moneriumAuthToken is only relevant after enabling Monerium offramps.
      // moneriumAuthToken: authToken,
      paymentData,
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
