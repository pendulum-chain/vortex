import { FiatToken, getNetworkId, Networks, RampDirection } from "@packages/shared";
import { useSelector } from "@xstate/react";
import { useCallback, useState } from "react";
import { useEventsContext } from "../../contexts/events";
import { useRampActor } from "../../contexts/rampState";
import { usePreRampCheck } from "../../services/initialChecks";
import {
  createMoonbeamEphemeral,
  createPendulumEphemeral,
  createStellarEphemeral
} from "../../services/transactions/ephemerals";
import { useQuoteFormStore, useQuoteFormStoreActions } from "../../stores/quote/useQuoteFormStore";
import { useRampDirectionStore } from "../../stores/rampDirectionStore";
import { RampExecutionInput } from "../../types/phases";

interface SubmissionError extends Error {
  code?: string;
  message: string;
}

const createEphemerals = () => {
  return {
    evmEphemeral: createMoonbeamEphemeral(),
    stellarEphemeral: createStellarEphemeral(),
    substrateEphemeral: createPendulumEphemeral()
  };
};

export const useRampSubmission = () => {
  const rampActor = useRampActor();
  const [executionPreparing, setExecutionPreparing] = useState(false);
  const { trackEvent } = useEventsContext();

  const { setTaxId, setPixId } = useQuoteFormStoreActions();

  const { address, quote } = useSelector(rampActor, state => ({
    address: state.context.address,
    quote: state.context.quote
  }));

  const { inputAmount, fiatToken, onChainToken } = useQuoteFormStore();
  const network = quote
    ? ((Object.values(Networks).includes(quote.to as Networks) ? quote.to : quote.from) as Networks)
    : Networks.Moonbeam;
  const chainId = getNetworkId(network);

  const preRampCheck = usePreRampCheck();
  const rampDirection = useRampDirectionStore(state => state.activeDirection);

  // @TODO: implement Error boundary
  const validateSubmissionData = useCallback(
    (data: { taxId?: string }) => {
      if (!address) {
        throw new Error("No wallet address found. Please connect your wallet.");
      }
      if (!quote) {
        throw new Error("No quote available. Please try again.");
      }
      if (!inputAmount) {
        throw new Error("No amount specified. Please enter an amount.");
      }
      if (fiatToken === FiatToken.BRL) {
        if (!data.taxId) {
          throw new Error("Tax ID is required for BRL transactions.");
        }
      }
    },
    [address, quote, inputAmount, fiatToken]
  );

  const prepareExecutionInput = useCallback(
    (data: { pixId?: string; taxId?: string; walletAddress?: string; moneriumWalletAddress?: string }) => {
      validateSubmissionData(data);
      if (!quote) {
        throw new Error("No quote available. Please try again.");
      }

      // We prioritize the wallet address from the form field.
      const userWalletAddress = rampDirection === RampDirection.BUY && data.walletAddress ? data.walletAddress : address;

      if (!userWalletAddress) {
        throw new Error("No address found. Please connect your wallet or provide a destination address.");
      }

      const ephemerals = createEphemerals();
      const executionInput: RampExecutionInput = {
        ephemerals,
        fiatToken,
        moneriumWalletAddress: data.moneriumWalletAddress,
        network,
        onChainToken,
        pixId: data.pixId,
        quote,
        setInitializeFailed: message => {
          console.error("Initialization failed:", message);
        },
        taxId: data.taxId,
        userWalletAddress
      };
      return executionInput;
    },
    [validateSubmissionData, quote, onChainToken, fiatToken, address, network, rampDirection]
  );

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
    },
    [trackEvent, fiatToken, onChainToken, inputAmount, quote?.outputAmount]
  );

  const onRampConfirm = useCallback(
    async (data?: { pixId?: string; taxId?: string; walletAddress?: string; moneriumWalletAddress?: string }) => {
      if (executionPreparing) return;
      setExecutionPreparing(true);

      try {
        if (!data) {
          throw new Error("Invalid ramp data.");
        }
        console.log("DEBUG: Ramp Submission Data: ", data);
        const executionInput = prepareExecutionInput(data);

        // This callback is generic and used for any ramp type.
        // The submission logic must ensure these fields are set if BRL
        if (executionInput.fiatToken === FiatToken.BRL) {
          if (!data.taxId) {
            throw new Error("TaxID, Address must be provided");
          }
          setTaxId(data.taxId);
          setPixId(data.taxId);
        }

        await preRampCheck(executionInput);
        if (chainId === undefined) {
          throw new Error("ChainId must be defined at this stage");
        }
        console.log("DEBUG: Ramp Execution Input: ", { input: { chainId, executionInput, rampDirection } });
        rampActor.send({ input: { chainId, executionInput, rampDirection }, type: "CONFIRM" });
      } catch (error) {
        handleSubmissionError(error as SubmissionError);
      } finally {
        setExecutionPreparing(false);
      }
    },
    [
      executionPreparing,
      prepareExecutionInput,
      preRampCheck,
      handleSubmissionError,
      rampDirection,
      chainId,
      rampActor,
      setPixId,
      setTaxId
    ]
  );

  return {
    isExecutionPreparing: executionPreparing,
    onRampConfirm,
    validateSubmissionData
  };
};
