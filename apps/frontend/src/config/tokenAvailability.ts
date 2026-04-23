import { FiatToken, SUPPORTED_FIAT_CURRENCIES } from "@vortexfi/shared";
import { DEFAULT_FIAT_TOKEN } from "../stores/quote/useQuoteFormStore";

export interface TokenAvailabilityConfig {
  enabled: boolean;
  disabledReasonTranslationKey: string;
}

const DISABLED_REASON_BY_TOKEN: Record<FiatToken, string> = {
  [FiatToken.EURC]: "pages.swap.error.EURC_tokenUnavailable",
  [FiatToken.ARS]: "pages.swap.error.ARS_tokenUnavailable",
  [FiatToken.BRL]: "pages.swap.error.BRL_tokenUnavailable",
  [FiatToken.USD]: "pages.swap.error.USD_tokenUnavailable",
  [FiatToken.MXN]: "pages.swap.error.MXN_tokenUnavailable",
  [FiatToken.COP]: "pages.swap.error.COP_tokenUnavailable"
};

export const fiatTokenAvailability: Record<FiatToken, TokenAvailabilityConfig> = Object.fromEntries(
  SUPPORTED_FIAT_CURRENCIES.map(c => [
    c.symbol,
    { disabledReasonTranslationKey: DISABLED_REASON_BY_TOKEN[c.symbol], enabled: c.enabled }
  ])
) as Record<FiatToken, TokenAvailabilityConfig>;

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
