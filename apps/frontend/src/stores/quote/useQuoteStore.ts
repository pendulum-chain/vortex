import { DestinationType, FiatToken, OnChainToken, QuoteError, QuoteResponse, RampDirection } from "@packages/shared";
import Big from "big.js";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { QuoteService } from "../../services/api";

interface QuoteParams {
  inputAmount?: Big;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  selectedNetwork: DestinationType;
  rampType: RampDirection;
  partnerId?: string;
}

interface QuotePayload {
  rampType: RampDirection;
  fromDestination: DestinationType;
  toDestination: DestinationType;
  inputAmount: string;
  inputCurrency: OnChainToken | FiatToken;
  outputCurrency: OnChainToken | FiatToken;
}

interface QuoteActions {
  actions: {
    fetchQuote: (params: QuoteParams) => Promise<void>;
    reset: () => void;
  };
}

interface QuoteState {
  quote: QuoteResponse | undefined;
  loading: boolean;
  error: string | null; // This is either the error message or the key of the translation
  outputAmount: Big | undefined;
  exchangeRate: number;
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

const friendlyErrorMessages: Record<QuoteError, string> = {
  // Validation errors - show specific messages
  [QuoteError.MissingRequiredFields]: "pages.swap.error.missingFields",
  [QuoteError.InvalidRampType]: "pages.swap.error.invalidRampType",
  [QuoteError.QuoteNotFound]: "pages.swap.error.quoteNotFound",

  // Amount too low - suggest larger amount
  [QuoteError.InputAmountTooLowToCoverFees]: "pages.swap.error.tryLargerAmount",
  [QuoteError.InputAmountForSwapMustBeGreaterThanZero]: "pages.swap.error.tryLargerAmount",
  [QuoteError.InputAmountTooLow]: "pages.swap.error.tryLargerAmount",
  [QuoteError.InputAmountTooLowToCoverCalculatedFees]: "pages.swap.error.tryLargerAmount",

  // Calculation failures - suggest different amount
  [QuoteError.UnableToGetPendulumTokenDetails]: "pages.swap.error.tryDifferentAmount",
  [QuoteError.FailedToCalculateQuote]: "pages.swap.error.tryDifferentAmount",
  [QuoteError.FailedToCalculatePreNablaDeductibleFees]: "pages.swap.error.tryDifferentAmount",
  [QuoteError.FailedToCalculateFeeComponents]: "pages.swap.error.tryDifferentAmount"
};

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const friendlyErrorMessage = friendlyErrorMessages[error.message as QuoteError];
    return friendlyErrorMessage || error.message;
  }

  return "pages.swap.error.fetchingQuote";
}

/**
 * Creates a quote payload based on ramp parameters
 * @param params Quote parameters
 * @returns Quote payload for API request
 */
const createQuotePayload = (params: QuoteParams): QuotePayload => {
  const { inputAmount, onChainToken, fiatToken, selectedNetwork, rampType } = params;
  const fiatDestination = mapFiatToDestination(fiatToken);
  const inputAmountStr = inputAmount?.toString() || "0";

  const payloadMap: Record<RampDirection, QuotePayload> = {
    [RampDirection.SELL]: {
      fromDestination: selectedNetwork,
      inputAmount: inputAmountStr,
      inputCurrency: onChainToken,
      outputCurrency: fiatToken,
      rampType: RampDirection.SELL,
      toDestination: fiatDestination
    },
    [RampDirection.BUY]: {
      fromDestination: fiatDestination,
      inputAmount: inputAmountStr,
      inputCurrency: fiatToken,
      outputCurrency: onChainToken,
      rampType: RampDirection.BUY,
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

const DEFAULT_QUOTE_STORE_VALUES: QuoteState = {
  error: null,
  exchangeRate: 0,
  loading: false,
  outputAmount: undefined,
  quote: undefined
};

export const useQuoteStore = create<QuoteState & QuoteActions>()(
  persist(
    (set, get) => ({
      ...DEFAULT_QUOTE_STORE_VALUES,
      actions: {
        fetchQuote: async (params: QuoteParams) => {
          const { inputAmount, partnerId } = params;

          if (!inputAmount || inputAmount.eq(0)) {
            set({ error: "pages.swap.error.invalidInputAmount", loading: false, outputAmount: Big(0), quote: undefined });
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
            set({
              error: getFriendlyErrorMessage(error),
              loading: false,
              outputAmount: undefined,
              quote: undefined
            });
          }
        },
        reset: () => {
          set({
            error: null,
            exchangeRate: 0,
            loading: false,
            outputAmount: undefined,
            quote: undefined
          });
        }
      },
      error: null,
      loading: false,
      providedQuoteId: undefined,
      quote: undefined
    }),
    {
      name: "useQuoteStore",
      partialize: state => ({
        error: state.error,
        loading: state.loading,
        quote: state.quote
      })
    }
  )
);

export const useQuoteOutputAmount = () => useQuoteStore(state => state.outputAmount);
export const useQuoteExchangeRate = () => useQuoteStore(state => state.exchangeRate);
export const useQuoteLoading = () => useQuoteStore(state => state.loading);
export const useQuoteError = () => useQuoteStore(state => state.error);
export const useQuote = () => useQuoteStore(state => state.quote);

export const useQuoteActions = () => useQuoteStore(state => state.actions);
