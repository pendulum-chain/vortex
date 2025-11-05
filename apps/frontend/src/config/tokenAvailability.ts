import { FiatToken } from "@vortexfi/shared";
import { DEFAULT_FIAT_TOKEN } from "../stores/quote/useQuoteFormStore";

export interface TokenAvailabilityConfig {
  enabled: boolean;
  disabledReasonTranslationKey: string;
}

// This is our central configuration for token availability
export const fiatTokenAvailability: Record<FiatToken, TokenAvailabilityConfig> = {
  [FiatToken.EURC]: {
    disabledReasonTranslationKey: "pages.swap.error.EURC_tokenUnavailable",
    enabled: true
  },
  [FiatToken.ARS]: {
    disabledReasonTranslationKey: "pages.swap.error.ARS_tokenUnavailable",
    enabled: true
  },
  [FiatToken.BRL]: {
    disabledReasonTranslationKey: "pages.swap.error.BRL_tokenUnavailable",
    enabled: true
  }
};

export function isFiatTokenEnabled(token: FiatToken): boolean {
  return fiatTokenAvailability[token]?.enabled ?? false;
}

export function isFiatTokenDisabled(token: FiatToken): boolean {
  return fiatTokenAvailability[token]?.enabled === false;
}

export function getTokenDisabledReason(token: FiatToken): string {
  return fiatTokenAvailability[token].disabledReasonTranslationKey;
}

export function getEnabledFiatTokens(): FiatToken[] {
  return Object.entries(fiatTokenAvailability)
    .filter(([_, config]) => config.enabled)
    .map(([token]) => token as FiatToken);
}

export function getFirstEnabledFiatToken(): FiatToken {
  const enabledTokens = getEnabledFiatTokens();
  return enabledTokens.length > 0 ? enabledTokens[0] : DEFAULT_FIAT_TOKEN;
}
