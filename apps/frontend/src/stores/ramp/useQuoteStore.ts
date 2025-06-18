import { DestinationType, FiatToken, OnChainToken, QuoteResponse } from "@packages/shared";
import Big from "big.js";
import { create } from "zustand";

import { QuoteService } from "../../services/api";

interface QuoteParams {
  inputAmount?: Big;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  selectedNetwork: DestinationType;
  rampType: RampType;
  partnerId?: string;
}

type RampType = "on" | "off";

interface QuotePayload {
  rampType: RampType;
  fromDestination: DestinationType;
  toDestination: DestinationType;
  inputAmount: string;
  inputCurrency: OnChainToken | FiatToken;
  outputCurrency: OnChainToken | FiatToken;
}

interface QuoteState {
  quote: QuoteResponse | undefined;
  loading: boolean;
  error: string | null;
  outputAmount: Big | undefined;
  exchangeRate: number;
  fetchQuote: (params: QuoteParams) => Promise<void>;
  reset: () => void;
}

/**
 * Maps a fiat token to its destination type
 * @param fiatToken The fiat token to map
 * @returns The corresponding destination type
 */
const mapFiatToDestination = (fiatToken: FiatToken): DestinationType => {
  const destinationMap: Record<FiatToken, DestinationType> = {
    ars: "cbu",
    brl: "pix",
    eur: "sepa"
  };

  return destinationMap[fiatToken] || "sepa";
};

/**
 * Creates a quote payload based on ramp parameters
 * @param params Quote parameters
 * @returns Quote payload for API request
 */
const createQuotePayload = (params: QuoteParams): QuotePayload => {
  const { inputAmount, onChainToken, fiatToken, selectedNetwork, rampType } = params;
  const fiatDestination = mapFiatToDestination(fiatToken);
  const inputAmountStr = inputAmount?.toString() || "0";

  const payloadMap: Record<RampType, QuotePayload> = {
    off: {
      fromDestination: selectedNetwork,
      inputAmount: inputAmountStr,
      inputCurrency: onChainToken,
      outputCurrency: fiatToken,
      rampType: "off",
      toDestination: fiatDestination
    },
    on: {
      fromDestination: fiatDestination,
      inputAmount: inputAmountStr,
      inputCurrency: fiatToken,
      outputCurrency: onChainToken,
      rampType: "on",
      toDestination: selectedNetwork
    }
  };

  return payloadMap[rampType];
};

/**
 * Calculates exchange rate and output amount from quote response
 * @param quoteResponse The API response
 * @returns Object containing output amount and exchange rate
 */
const processQuoteResponse = (quoteResponse: QuoteResponse) => {
  const outputAmount = Big(quoteResponse.outputAmount);
  const exchangeRate = Number(quoteResponse.outputAmount) / Number(quoteResponse.inputAmount);

  return { exchangeRate, outputAmount };
};

export const useQuoteStore = create<QuoteState>(set => ({
  error: null,
  exchangeRate: 0,

  fetchQuote: async (params: QuoteParams) => {
    const { inputAmount, partnerId } = params;

    if (!inputAmount) {
      set({ error: "Invalid input parameters", loading: false });
      return;
    }

    set({ error: null, loading: true });

    try {
      const quotePayload = createQuotePayload(params);

      const quoteResponse = await QuoteService.createQuote(
        quotePayload.rampType,
        quotePayload.fromDestination,
        quotePayload.toDestination,
        quotePayload.inputAmount,
        quotePayload.inputCurrency,
        quotePayload.outputCurrency,
        partnerId
      );

      const { outputAmount, exchangeRate } = processQuoteResponse(quoteResponse);

      set({
        exchangeRate,
        loading: false,
        outputAmount,
        quote: quoteResponse
      });
    } catch (error) {
      console.error("Error fetching quote:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to get quote";
      set({
        error: errorMessage,
        loading: false,
        outputAmount: undefined,
        quote: undefined
      });
    }
  },
  loading: false,
  outputAmount: undefined,
  quote: undefined,

  reset: () => {
    set({
      error: null,
      exchangeRate: 0,
      loading: false,
      outputAmount: undefined,
      quote: undefined
    });
  }
}));

export const useQuoteOutputAmount = () => useQuoteStore(state => state.outputAmount);
export const useQuoteExchangeRate = () => useQuoteStore(state => state.exchangeRate);
export const useQuoteLoading = () => useQuoteStore(state => state.loading);
export const useQuoteError = () => useQuoteStore(state => state.error);
export const useQuote = () => useQuoteStore(state => state.quote);
