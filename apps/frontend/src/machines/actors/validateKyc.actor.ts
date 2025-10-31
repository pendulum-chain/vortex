import { BrlaErrorResponse, FiatToken, isValidCnpj, isValidCpf, RampDirection } from "@vortexfi/shared";

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
      const { evmAddress: brlaEvmAddress, subAccountId } = await BrlaService.getUser(taxId);
      console.log("existing subaccunt: ", subAccountId);
      const remainingLimitResponse = await BrlaService.getUserRemainingLimit(taxId, rampDirection);

      console.log("Remaining limit response from BRLA:", remainingLimitResponse);

      const amountNum = Number(
        rampDirection === RampDirection.SELL ? executionInput.quote.outputAmount : executionInput.quote.inputAmount
      );
      const remainingLimitNum = Number(remainingLimitResponse.remainingLimit);

      if (amountNum > remainingLimitNum) {
        // Avenia-Migration: this must be changed. No more levels. TOAST?
        // We don't know of a possibility to increase limits so far.
        throw new Error("Insufficient remaining limit for this transaction.");
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
