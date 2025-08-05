import { useSelector } from "@xstate/react";
import Big from "big.js";
import { useCallback } from "react";
import { RampDirection } from "../../../components/RampToggle";
import { useNetwork } from "../../../contexts/network";
import { useRampActor } from "../../../contexts/rampState";
import { usePartnerId } from "../../../stores/partnerStore";
import { useQuote, useQuoteStore } from "../../../stores/ramp/useQuoteStore";
import { useFiatToken, useInputAmount, useOnChainToken } from "../../../stores/ramp/useRampFormStore";
import { useRampDirection } from "../../../stores/rampDirectionStore";
import { useRampSummaryVisible } from "../../../stores/rampStore";

interface UseQuoteRefreshDataReturn {
  hasValidQuote: boolean;
  shouldRefresh: boolean;
  performRefresh: () => Promise<void>;
}

export const useQuoteRefreshData = (): UseQuoteRefreshDataReturn => {
  const rampActor = useRampActor();
  const quote = useQuote();
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();
  const { selectedNetwork } = useNetwork();
  const rampDirection = useRampDirection();
  const partnerId = usePartnerId();
  const { fetchQuote } = useQuoteStore();

  const rampSummaryVisible = useSelector(rampActor, state => state.context.rampSummaryVisible);
  const hasValidQuote = Boolean(quote && inputAmount && onChainToken && fiatToken);
  const shouldRefresh = hasValidQuote && !rampSummaryVisible;
  const rampType = rampDirection === RampDirection.ONRAMP ? "on" : "off";

  const performRefresh = useCallback(async () => {
    if (!hasValidQuote || !inputAmount) return;

    try {
      await fetchQuote({
        fiatToken,
        inputAmount: Big(inputAmount),
        onChainToken,
        partnerId: partnerId === null ? undefined : partnerId,
        rampType,
        selectedNetwork
      });
    } catch (error) {
      console.error("Failed to refresh quote:", error);
    }
  }, [hasValidQuote, inputAmount, onChainToken, fiatToken, selectedNetwork, rampType, partnerId, fetchQuote]);

  return {
    hasValidQuote,
    performRefresh,
    shouldRefresh
  };
};
