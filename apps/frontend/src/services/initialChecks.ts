import { FiatToken, RampDirection } from "@vortexfi/shared";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToastMessage } from "../helpers/notifications";
import { useRampDirection } from "../stores/rampDirectionStore";
import { RampExecutionInput } from "../types/phases";
import { BrlaService } from "./api";

function useRampAmountWithinAllowedLimits() {
  const { t } = useTranslation();
  const { showToast, ToastMessage } = useToastMessage();
  const rampDirection = useRampDirection();

  return useCallback(
    async (amountUnits: string, taxId: string): Promise<boolean> => {
      try {
        const subaccount = await BrlaService.getUser(taxId);
        // This check passes if subaccount is not created, or if identity status is not confirmed
        if (subaccount.identityStatus !== "CONFIRMED") {
          return true;
        }

        const remainingLimitResponse = await BrlaService.getUserRemainingLimit(taxId, rampDirection);
        const remainingLimitInUnits = remainingLimitResponse.remainingLimit;

        const amountNum = Number(amountUnits);
        const remainingLimitNum = Number(remainingLimitInUnits);

        if (amountNum <= remainingLimitNum) {
          return true;
        } else {
          showToast(ToastMessage.RAMP_LIMIT_EXCEEDED, t("toasts.rampLimitExceeded", { remaining: remainingLimitInUnits }));
          return false;
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("Subaccount not found")) {
          return true; // If the subaccount is not found, the user is not registered and allow the flow to continue.
        }
        console.error("useRampAmountWithinAllowedLimits: Error checking ramp limits: ", error);
        return false;
      }
    },
    [rampDirection, showToast, t, ToastMessage.RAMP_LIMIT_EXCEEDED]
  );
}

export function usePreRampCheck() {
  const rampWithinLimits = useRampAmountWithinAllowedLimits();

  return useCallback(
    async (executionInput: RampExecutionInput) => {
      // For BRL ramps, check if the user is within the limits
      if (executionInput.fiatToken === FiatToken.BRL) {
        if (!executionInput.taxId) {
          throw new Error("Tax ID is required for BRL transactions.");
        }

        const isWithinLimits = await rampWithinLimits(
          executionInput.quote.rampType === RampDirection.BUY
            ? executionInput.quote.inputAmount
            : executionInput.quote.outputAmount,
          executionInput.taxId
        );
        if (!isWithinLimits) {
          throw new Error("Ramp amount exceeds the allowed limits.");
        }
      }
    },
    [rampWithinLimits]
  );
}
