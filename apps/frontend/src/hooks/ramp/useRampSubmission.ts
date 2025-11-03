import {
  createMoonbeamEphemeral,
  createPendulumEphemeral,
  createStellarEphemeral,
  FiatToken,
  getNetworkId,
  Networks
} from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { useCallback, useState } from "react";
import { useEventsContext } from "../../contexts/events";
import { useRampActor } from "../../contexts/rampState";
import { usePreRampCheck } from "../../services/initialChecks";
import { useQuoteFormStore, useQuoteFormStoreActions } from "../../stores/quote/useQuoteFormStore";
import { useRampDirectionStore } from "../../stores/rampDirectionStore";
import { RampExecutionInput } from "../../types/phases";

interface SubmissionError extends Error {
  code?: string;
  message: string;
}

const createEphemerals = async () => {
  return {
    evmEphemeral: createMoonbeamEphemeral(),
    stellarEphemeral: createStellarEphemeral(),
    substrateEphemeral: await createPendulumEphemeral()
  };
};

export const useRampSubmission = () => {
  const rampActor = useRampActor();
  const [executionPreparing, setExecutionPreparing] = useState(false);
  const { trackEvent } = useEventsContext();

  const { setTaxId, setPixId } = useQuoteFormStoreActions();

  const { connectedWalletAddress, quote } = useSelector(rampActor, state => ({
    connectedWalletAddress: state.context.connectedWalletAddress,
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
      if (!connectedWalletAddress) {
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
    [connectedWalletAddress, quote, inputAmount, fiatToken]
  );

  const prepareExecutionInput = useCallback(
    async (data: { pixId?: string; taxId?: string; walletAddress?: string; moneriumWalletAddress?: string }) => {
      validateSubmissionData(data);
      if (!quote) {
        throw new Error("No quote available. Please try again.");
      }

      // We prioritize the wallet address from the form field.
      const userWalletAddress = data.walletAddress ? data.walletAddress : connectedWalletAddress;

      if (!userWalletAddress) {
        throw new Error("No address found. Please connect your wallet or provide a destination address.");
      }

      const ephemerals = await createEphemerals();
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
        sourceOrDestinationAddress: userWalletAddress,
        taxId: data.taxId
      };
      return executionInput;
    },
    [validateSubmissionData, quote, onChainToken, fiatToken, connectedWalletAddress, network]
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
        const executionInput = await prepareExecutionInput(data);

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
