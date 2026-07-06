import { FiatToken, isAlfredpayToken, isValidCnpj, isValidCpf, RampDirection } from "@vortexfi/shared";

import { BrlaService, isApiError } from "../../services/api";
import { RampContext } from "../types";

interface ValidateKycResult {
  kycNeeded: boolean;
  brlaEvmAddress?: string;
}

export const validateKycActor = async ({ input }: { input: RampContext }): Promise<ValidateKycResult> => {
  const { executionInput, rampDirection, quoteId, externalSessionId } = input;
  console.log("Validating KYC with input:", input);

  if (!executionInput) {
    throw new Error("executionInput is missing from ramp context");
  }

  if (!rampDirection) {
    throw new Error("rampDirection is missing from ramp context");
  }

  if (!quoteId) {
    throw new Error("quoteId is missing from ramp context");
  }

  if (
    executionInput.fiatToken === FiatToken.EURC ||
    executionInput.fiatToken === FiatToken.ARS ||
    isAlfredpayToken(executionInput.fiatToken)
  ) {
    return { kycNeeded: true };
  }

  if (executionInput.fiatToken === FiatToken.BRL) {
    const { taxId } = executionInput;
    if (!taxId) {
      throw new Error("Tax ID must exist when validating KYC for BRL transactions");
    }

    try {
      const { evmAddress: brlaEvmAddress, subAccountId, identityStatus } = await BrlaService.getUser(taxId);
      console.log("existing subaccount: ", subAccountId, "identityStatus:", identityStatus);
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

      // Only skip KYC if identity is confirmed - handles case where user created subaccount but didn't complete KYC
      if (identityStatus !== "CONFIRMED") {
        console.log("User exists but KYC not confirmed. Needs KYC.");
        return { brlaEvmAddress, kycNeeded: true };
      }

      return { brlaEvmAddress, kycNeeded: false };
    } catch (err) {
      // "KYC invalid" comes from the remaining-limit endpoint for an existing user whose
      // identity check failed, so it must win over the valid-CPF "user doesn't exist yet"
      // branch below — that one would wrongly record an initial KYC attempt.
      if (isApiError(err) && err.data.error?.includes("KYC invalid")) {
        console.log("User KYC is invalid. Needs KYC.");
        return { kycNeeded: true };
      }

      if (isValidCpf(taxId) || isValidCnpj(taxId)) {
        console.log("User doesn't exist yet. Needs KYC.");
        BrlaService.recordInitialKycAttempt(taxId, quoteId, externalSessionId);
        return { kycNeeded: true };
      }
      console.error("Error while fetching BRLA user in KYC check", err);
      throw err;
    }
  }

  return { kycNeeded: false };
};
