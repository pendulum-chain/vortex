import { useSelector } from "@xstate/react";
import Big from "big.js";
import { useCallback } from "react";
import { useNetwork } from "../../../contexts/network";
import { useRampActor } from "../../../contexts/rampState";
import { usePartnerId } from "../../../stores/partnerStore";
import { useFiatToken, useInputAmount, useOnChainToken } from "../../../stores/quote/useQuoteFormStore";
import { useQuote, useQuoteStore } from "../../../stores/quote/useQuoteStore";
import { useRampDirection } from "../../../stores/rampDirectionStore";

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
  const rampType = useRampDirection();
  const partnerId = usePartnerId();
  const {
    actions: { fetchQuote }
  } = useQuoteStore();

  const rampSummaryVisible = useSelector(
    rampActor,
    state =>
      state.matches("KycComplete") || state.matches("RegisterRamp") || state.matches("UpdateRamp") || state.matches("StartRamp")
  );
  const hasValidQuote = Boolean(quote && inputAmount && onChainToken && fiatToken);
  const shouldRefresh = hasValidQuote && !rampSummaryVisible;

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
