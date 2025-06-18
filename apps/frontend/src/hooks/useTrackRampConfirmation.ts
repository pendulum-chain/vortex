import { useCallback } from "react";
import { RampDirection } from "../components/RampToggle";
import { useEventsContext } from "../contexts/events";
import { useQuoteStore } from "../stores/ramp/useQuoteStore";
import { useFiatToken, useInputAmount, useOnChainToken } from "../stores/ramp/useRampFormStore";
import { useRampDirection } from "../stores/rampDirectionStore";

export const useTrackRampConfirmation = () => {
  const rampDirection = useRampDirection();
  const { trackEvent } = useEventsContext();
  const fiatToken = useFiatToken();
  const onChainToken = useOnChainToken();
  const inputAmount = useInputAmount();
  const { quote } = useQuoteStore();

  return useCallback(() => {
    const fromAsset = rampDirection === RampDirection.ONRAMP ? fiatToken : onChainToken;
    const toAsset = rampDirection === RampDirection.ONRAMP ? onChainToken : fiatToken;
    trackEvent({
      event: "transaction_confirmation",
      from_amount: inputAmount?.toString() || "0",
      from_asset: fromAsset,
      to_amount: quote?.outputAmount || "0",
      to_asset: toAsset
    });
  }, [fiatToken, onChainToken, inputAmount, quote, rampDirection, trackEvent]);
};
