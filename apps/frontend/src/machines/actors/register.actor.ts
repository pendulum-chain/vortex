import {
  AccountMeta,
  ApiManager,
  EphemeralAccountType,
  FiatToken,
  getAddressForFormat,
  isAlfredpayToken,
  Networks,
  RampDirection,
  RegisterRampRequest,
  signUnsignedTransactions
} from "@vortexfi/shared";
import { config } from "../../config";
import { RampService } from "../../services/api";
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
  const { executionInput, chainId, connectedWalletAddress, paymentData, quote, userId } = input;

  // TODO there should be a way to assert types in states, given transitions should ensure the type.
  if (!executionInput || !quote) {
    throw new RegisterRampError("Execution input and quote are required to register ramp.", RegisterRampErrorType.InvalidInput);
  }

  if (!connectedWalletAddress) {
    throw new RegisterRampError("Wallet address is required to register ramp.", RegisterRampErrorType.InvalidInput);
  }

  const apiManager = ApiManager.getInstance();
  const pendulumApiComponents = await apiManager.getApi(Networks.Pendulum);
  const moonbeamApiComponents = await apiManager.getApi(Networks.Moonbeam);
  const hydrationApiComponents = await apiManager.getApi(Networks.Hydration);

  if (!chainId) {
    throw new RegisterRampError("Chain ID is required to register ramp.", RegisterRampErrorType.InvalidInput);
  }

  const quoteId = quote.id;
  // NOTE: Stellar ephemeral is intentionally omitted — ARS is the only fiat that still uses
  // the Stellar route and it's currently disabled. Re-enabling ARS requires reinstating
  // createEphemerals' stellar entry here AND in useRampSubmission.ts to avoid a "Stellar
  // signer not found" server error in prepareOnrampStellarPath.
  const signingAccounts: AccountMeta[] = [
    {
      address: executionInput.ephemerals.evmEphemeral.address,
      type: EphemeralAccountType.EVM
    },
    {
      address: executionInput.ephemerals.substrateEphemeral.address,
      type: EphemeralAccountType.Substrate
    }
  ];

  let additionalData: RegisterRampRequest["additionalData"] = {};

  if (quote.rampType === RampDirection.BUY && executionInput.fiatToken === FiatToken.BRL) {
    additionalData = {
      destinationAddress: executionInput.sourceOrDestinationAddress,
      sessionId: input.externalSessionId,
      taxId: executionInput.taxId
    };
  } else if (quote.rampType === RampDirection.BUY && executionInput.fiatToken === FiatToken.EURC) {
    additionalData = {
      destinationAddress: executionInput.sourceOrDestinationAddress,
      sessionId: input.externalSessionId,
      walletAddress: connectedWalletAddress
    };
  } else if (quote.rampType === RampDirection.SELL && executionInput.fiatToken === FiatToken.EURC) {
    additionalData = {
      sessionId: input.externalSessionId,
      walletAddress: connectedWalletAddress
    };
  } else if (quote.rampType === RampDirection.SELL && executionInput.fiatToken === FiatToken.BRL) {
    additionalData = {
      pixDestination: executionInput.pixId,
      receiverTaxId: executionInput.taxId,
      sessionId: input.externalSessionId,
      taxId: executionInput.taxId,
      walletAddress: connectedWalletAddress
    };
  } else if (quote.rampType === RampDirection.BUY && isAlfredpayToken(executionInput.fiatToken)) {
    additionalData = {
      destinationAddress: executionInput.sourceOrDestinationAddress,
      fiatAccountId: executionInput.selectedFiatAccountId,
      sessionId: input.externalSessionId,
      walletAddress: connectedWalletAddress
    };
  } else if (quote.rampType === RampDirection.SELL && isAlfredpayToken(executionInput.fiatToken)) {
    additionalData = {
      fiatAccountId: executionInput.selectedFiatAccountId,
      sessionId: input.externalSessionId,
      walletAddress: connectedWalletAddress
    };
  } else {
    additionalData = {
      paymentData,
      sessionId: input.externalSessionId,
      walletAddress: connectedWalletAddress
    };
  }

  const rampProcess = await RampService.registerRamp(quoteId, signingAccounts, additionalData, userId);

  const ephemeralTxs = (rampProcess.unsignedTxs || []).filter(tx => {
    if (!connectedWalletAddress) {
      return true;
    }

    return chainId < 0 &&
      (tx.network === Networks.Pendulum || tx.network === Networks.AssetHub || tx.network === Networks.Hydration)
      ? getAddressForFormat(tx.signer, 0) !== getAddressForFormat(connectedWalletAddress, 0)
      : tx.signer.toLowerCase() !== connectedWalletAddress.toLowerCase();
  });

  const signedTransactions = await signUnsignedTransactions(
    ephemeralTxs,
    executionInput.ephemerals,
    pendulumApiComponents.api,
    moonbeamApiComponents.api,
    hydrationApiComponents.api,
    config.alchemyApiKey
  );

  const updatedRampProcess = await RampService.updateRamp(rampProcess.id, signedTransactions);

  const newRampState: RampState = {
    quote,
    ramp: updatedRampProcess,
    requiredUserActionsCompleted: false,
    signedTransactions,
    userSigningMeta: {
      assethubToPendulumHash: undefined,
      moneriumOnrampApproveHash: undefined,
      squidRouterApproveHash: undefined,
      squidRouterSwapHash: undefined
    }
  };

  return newRampState;
};
