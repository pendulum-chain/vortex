import { useCallback, useState } from "react";
import { useEventsContext } from "../../contexts/events";
import { useNetwork } from "../../contexts/network";
import { usePreRampCheck } from "../../services/initialChecks";
import {
  createMoonbeamEphemeral,
  createPendulumEphemeral,
  createStellarEphemeral
} from "../../services/transactions/ephemerals";
import { useQuoteStore } from "../../stores/ramp/useQuoteStore";
import { useRampFormStore } from "../../stores/ramp/useRampFormStore";
import { useRampActions } from "../../stores/rampStore";
import { RampExecutionInput } from "../../types/phases";
import { useRegisterRamp } from "../offramp/useRampService/useRegisterRamp";
import { useStartRamp } from "../offramp/useRampService/useStartRamp";
import { useVortexAccount } from "../useVortexAccount";

interface SubmissionError extends Error {
  code?: string;
  message: string;
}

const createEphemerals = () => ({
  moonbeamEphemeral: createMoonbeamEphemeral(),
  pendulumEphemeral: createPendulumEphemeral(),
  stellarEphemeral: createStellarEphemeral()
});

export const useRampSubmission = () => {
  const [executionPreparing, setExecutionPreparing] = useState(false);
  const { inputAmount, fiatToken, onChainToken, taxId, pixId } = useRampFormStore();
  const { quote } = useQuoteStore();
  const { address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();
  const { setRampExecutionInput, setRampInitiating, resetRampState } = useRampActions();
  const { registerRamp } = useRegisterRamp();
  const preRampCheck = usePreRampCheck();
  useStartRamp(); // This will automatically start the ramp process when the conditions are met

  // @TODO: implement Error boundary
  const validateSubmissionData = useCallback(() => {
    if (!address) {
      throw new Error("No wallet address found. Please connect your wallet.");
    }
    if (!quote) {
      throw new Error("No quote available. Please try again.");
    }
    if (!inputAmount) {
      throw new Error("No amount specified. Please enter an amount.");
    }
    if (fiatToken === "brl") {
      if (!taxId) {
        throw new Error("Tax ID is required for BRL transactions.");
      }
    }
  }, [address, quote, inputAmount, fiatToken, taxId]);

  const prepareExecutionInput = useCallback(() => {
    validateSubmissionData();
    if (!quote) {
      throw new Error("No quote available. Please try again.");
    }
    if (!address) {
      throw new Error("No address found. Please connect your wallet.");
    }

    const ephemerals = createEphemerals();
    const executionInput: RampExecutionInput = {
      ephemerals,
      fiatToken,
      network: selectedNetwork,
      onChainToken,
      pixId,
      quote,
      setInitializeFailed: message => {
        console.error("Initialization failed:", message);
      },
      taxId,
      userWalletAddress: address
    };
    return executionInput;
  }, [validateSubmissionData, quote, onChainToken, fiatToken, address, selectedNetwork, taxId, pixId]);

  const handleSubmissionError = useCallback(
    (error: SubmissionError) => {
      console.error("Error preparing submission:", error);
      trackEvent({
        error_message: error.code || "unknown",
        event: "transaction_failure",
        from_amount: inputAmount?.toString() || "0",
        from_asset: fiatToken,
        phase_index: 0,
        to_amount: quote?.outputAmount || "0",
        to_asset: onChainToken
      });
      setRampInitiating(false);
    },
    [trackEvent, fiatToken, onChainToken, inputAmount, quote?.outputAmount, setRampInitiating]
  );

  const onRampConfirm = useCallback(async () => {
    if (executionPreparing) return;
    setExecutionPreparing(true);

    try {
      const executionInput = prepareExecutionInput();
      await preRampCheck(executionInput);
      setRampExecutionInput(executionInput);
      await registerRamp(executionInput);
    } catch (error) {
      handleSubmissionError(error as SubmissionError);
    } finally {
      setExecutionPreparing(false);
    }
  }, [executionPreparing, prepareExecutionInput, preRampCheck, setRampExecutionInput, registerRamp, handleSubmissionError]);

  return {
    finishOfframping: () => {
      resetRampState();
    },
    isExecutionPreparing: executionPreparing,
    onRampConfirm,
    validateSubmissionData
  };
};
