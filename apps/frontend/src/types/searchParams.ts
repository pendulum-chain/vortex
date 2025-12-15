import { PaymentMethod, RampDirection } from "@vortexfi/shared";

/**
 * Search parameters schema for ramp-related routes
 * These are the URL query parameters that can be passed to the application
 */
export interface RampSearchParams {
  rampType?: RampDirection;
  network?: string;
  inputAmount?: string;
  apiKey?: string;
  partnerId?: string;
  quoteId?: string;
  code?: string;
  fiat?: string;
  countryCode?: string;
  cryptoLocked?: string;
  paymentMethod?: PaymentMethod;
  walletAddressLocked?: string;
  callbackUrl?: string;
  externalSessionId?: string;
}

/**
 * Validates and sanitizes search parameters
 * TanStack Router will use this to parse URL search params
 */
export const validateRampSearchParams = (search: Record<string, unknown>): RampSearchParams => {
  return {
    apiKey: typeof search.apiKey === "string" ? search.apiKey : undefined,
    callbackUrl: typeof search.callbackUrl === "string" ? search.callbackUrl : undefined,
    code: typeof search.code === "string" ? search.code : undefined,
    countryCode: typeof search.countryCode === "string" ? search.countryCode : undefined,
    cryptoLocked: typeof search.cryptoLocked === "string" ? search.cryptoLocked : undefined,
    externalSessionId: typeof search.externalSessionId === "string" ? search.externalSessionId : undefined,
    fiat: typeof search.fiat === "string" ? search.fiat : undefined,
    inputAmount: typeof search.inputAmount === "string" ? search.inputAmount : undefined,
    network: typeof search.network === "string" ? search.network : undefined,
    partnerId: typeof search.partnerId === "string" ? search.partnerId : undefined,
    paymentMethod: typeof search.paymentMethod === "string" ? (search.paymentMethod as PaymentMethod) : undefined,
    quoteId: typeof search.quoteId === "string" ? search.quoteId : undefined,
    rampType: search.rampType === RampDirection.BUY || search.rampType === RampDirection.SELL ? search.rampType : undefined,
    walletAddressLocked: typeof search.walletAddressLocked === "string" ? search.walletAddressLocked : undefined
  };
};
