import { RampDirection } from "@packages/shared";
import { useCallback } from "react";
import { useEventsContext } from "../contexts/events";
import { useFiatToken, useInputAmount, useOnChainToken } from "../stores/quote/useQuoteFormStore";
import { useQuoteStore } from "../stores/quote/useQuoteStore";
import { useRampDirection } from "../stores/rampDirectionStore";

export const useTrackRampConfirmation = () => {
  const rampDirection = useRampDirection();
  const { trackEvent } = useEventsContext();
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const inputAmount = useInputAmount();
  const { quote } = useQuoteStore();

  return useCallback(() => {
    const fromAsset = rampDirection === RampDirection.BUY ? fiatToken : onChainToken;
    const toAsset = rampDirection === RampDirection.BUY ? onChainToken : fiatToken;
    trackEvent({
      event: "transaction_confirmation",
      from_amount: inputAmount?.toString() || "0",
      from_asset: fromAsset,
      to_amount: quote?.outputAmount || "0",
      to_asset: toAsset
    });
  }, [fiatToken, onChainToken, inputAmount, quote, rampDirection, trackEvent]);
};
