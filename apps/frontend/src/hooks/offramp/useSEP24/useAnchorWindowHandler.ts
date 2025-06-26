import { PaymentData } from "@packages/shared";
import Big from "big.js";
import { useCallback } from "react";

import { useNetwork } from "../../../contexts/network";
import { useToastMessage } from "../../../helpers/notifications";
import { sep24Second } from "../../../services/anchor/sep24/second";
import { useRampActions, useRampStore } from "../../../stores/rampStore";
import { useSep24AnchorSessionParams, useSep24InitialResponse } from "../../../stores/sep24Store";
import { useTrackSEP24Events } from "./useTrackSEP24Events";

const handleError = (error: unknown, setRampingStarted: (started: boolean) => void): void => {
  console.error("Error in SEP-24 flow:", error);
  setRampingStarted(false);
};

export const useAnchorWindowHandler = () => {
  const { trackKYCStarted } = useTrackSEP24Events();
  const { selectedNetwork } = useNetwork();
  const { setRampStarted } = useRampActions();

  const { showToast, ToastMessage } = useToastMessage();

  const firstSep24Response = useSep24InitialResponse();
  const anchorSessionParams = useSep24AnchorSessionParams();

  const {
    rampExecutionInput: executionInput,
    actions: { setRampExecutionInput }
  } = useRampStore();

  const handleAmountMismatch = useCallback(
    (setOfframpingStarted: (started: boolean) => void): void => {
      setOfframpingStarted(false);
      showToast(ToastMessage.AMOUNT_MISMATCH);
    },
    [showToast, ToastMessage]
  );

  return useCallback(async () => {
    console.log(
      "firstSep24Response",
      firstSep24Response,
      "anchorSessionParams",
      anchorSessionParams,
      "executionInput",
      executionInput
    );
    if (!firstSep24Response || !anchorSessionParams || !executionInput) {
      return;
    }

    trackKYCStarted(executionInput, selectedNetwork);

    try {
      const secondSep24Response = await sep24Second(firstSep24Response, anchorSessionParams);
      const amountBeforeFees = Big(executionInput.quote.outputAmount).plus(executionInput.quote.fee.anchor).toFixed(2);

      if (!Big(secondSep24Response.amount).eq(amountBeforeFees)) {
        handleAmountMismatch(setRampStarted);
        return;
      }

      const paymentData: PaymentData = {
        amount: secondSep24Response.amount,
        anchorTargetAccount: secondSep24Response.offrampingAccount,
        memo: secondSep24Response.memo,
        memoType: secondSep24Response.memoType as "text" | "hash"
      };

      setRampExecutionInput({ ...executionInput, paymentData });
    } catch (error) {
      handleError(error, setRampStarted);
    }
  }, [
    firstSep24Response,
    anchorSessionParams,
    executionInput,
    trackKYCStarted,
    selectedNetwork,
    setRampExecutionInput,
    handleAmountMismatch,
    setRampStarted
  ]);
};
