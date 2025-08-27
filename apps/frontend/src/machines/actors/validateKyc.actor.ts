import { BrlaErrorResponse, FiatToken, RampDirection } from "@packages/shared";
import { isValidCnpj, isValidCpf } from "../../hooks/ramp/schema";
import { BrlaService } from "../../services/api";
import { RampContext } from "../types";

interface ValidateKycResult {
  kycNeeded: boolean;
  brlaEvmAddress?: string;
}

export const validateKycActor = async ({ input }: { input: RampContext }): Promise<ValidateKycResult> => {
  const { executionInput, rampDirection } = input;
  console.log("Validating KYC with input:", input);

  if (!executionInput) {
    throw new Error("executionInput is missing from ramp context");
  }

  if (!rampDirection) {
    throw new Error("rampDirection is missing from ramp context");
  }

  if (executionInput.fiatToken === FiatToken.EURC || executionInput.fiatToken === FiatToken.ARS) {
    return { kycNeeded: true };
  }

  if (executionInput.fiatToken === FiatToken.BRL) {
    const { taxId } = executionInput;
    if (!taxId) {
      throw new Error("Tax ID must exist when validating KYC for BRL transactions");
    }

    try {
      const { evmAddress: brlaEvmAddress } = await BrlaService.getUser(taxId);
      const remainingLimitResponse = await BrlaService.getUserRemainingLimit(taxId);

      const remainingLimitInUnits =
        rampDirection === RampDirection.SELL
          ? remainingLimitResponse.remainingLimitOfframp
          : remainingLimitResponse.remainingLimitOnramp;

      const amountNum = Number(
        rampDirection === RampDirection.SELL ? executionInput.quote.outputAmount : executionInput.quote.inputAmount
      );
      const remainingLimitNum = Number(remainingLimitInUnits);

      if (amountNum > remainingLimitNum) {
        return { kycNeeded: true };
      }

      return { brlaEvmAddress, kycNeeded: false };
    } catch (err) {
      const errorResponse = err as BrlaErrorResponse;

      if (isValidCpf(taxId) || isValidCnpj(taxId)) {
        console.log("User doesn't exist yet. Needs KYC.");
        return { kycNeeded: true };
      } else if (errorResponse.error?.includes("KYC invalid")) {
        console.log("User KYC is invalid. Needs KYC.");
        return { kycNeeded: true };
      }
      console.error("Error while fetching BRLA user in KYC check", err);
      throw err;
    }
  }

  return { kycNeeded: false };
};
