import { FiatToken, isAlfredpayToken, RampDirection, RegisterRampRequest } from "@vortexfi/shared";
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

export function buildRegisterRampAdditionalData(
  input: RampContext,
  connectedWalletAddress: string
): RegisterRampRequest["additionalData"] {
  const { executionInput, paymentData } = input;

  if (!executionInput) {
    throw new RegisterRampError("Execution input is required to register ramp.", RegisterRampErrorType.InvalidInput);
  }

  const rampType = executionInput.quote.rampType;

  if (rampType === RampDirection.BUY && executionInput.fiatToken === FiatToken.BRL) {
    return {
      destinationAddress: executionInput.sourceOrDestinationAddress,
      sessionId: input.externalSessionId,
      taxId: executionInput.taxId
    };
  }

  if (rampType === RampDirection.BUY && executionInput.fiatToken === FiatToken.EURC) {
    if (!input.userEmail) {
      throw new RegisterRampError("User email is required for Mykobo EUR onramp.", RegisterRampErrorType.InvalidInput);
    }

    return {
      destinationAddress: executionInput.sourceOrDestinationAddress,
      email: input.userEmail,
      sessionId: input.externalSessionId
    };
  }

  if (rampType === RampDirection.SELL && executionInput.fiatToken === FiatToken.EURC) {
    if (!input.userEmail) {
      throw new RegisterRampError("User email is required for Mykobo EUR offramp.", RegisterRampErrorType.InvalidInput);
    }

    return {
      destinationAddress: executionInput.sourceOrDestinationAddress,
      email: input.userEmail,
      sessionId: input.externalSessionId,
      walletAddress: connectedWalletAddress
    };
  }

  if (rampType === RampDirection.SELL && executionInput.fiatToken === FiatToken.BRL) {
    return {
      pixDestination: executionInput.pixId,
      receiverTaxId: executionInput.taxId,
      sessionId: input.externalSessionId,
      taxId: executionInput.taxId,
      walletAddress: connectedWalletAddress
    };
  }

  if (rampType === RampDirection.BUY && isAlfredpayToken(executionInput.fiatToken)) {
    return {
      destinationAddress: executionInput.sourceOrDestinationAddress,
      fiatAccountId: executionInput.selectedFiatAccountId,
      sessionId: input.externalSessionId,
      walletAddress: connectedWalletAddress
    };
  }

  if (rampType === RampDirection.SELL && isAlfredpayToken(executionInput.fiatToken)) {
    return {
      fiatAccountId: executionInput.selectedFiatAccountId,
      sessionId: input.externalSessionId,
      walletAddress: connectedWalletAddress
    };
  }

  return {
    paymentData,
    sessionId: input.externalSessionId,
    walletAddress: connectedWalletAddress
  };
}
