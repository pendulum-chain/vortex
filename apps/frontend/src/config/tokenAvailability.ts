import { FiatToken } from '@packages/shared';
import { DEFAULT_FIAT_TOKEN } from '../stores/ramp/useRampFormStore';

export interface TokenAvailabilityConfig {
  enabled: boolean;
  disabledReasonTranslationKey: string;
}

// This is our central configuration for token availability
export const fiatTokenAvailability: Record<FiatToken, TokenAvailabilityConfig> = {
  [FiatToken.EURC]: {
    enabled: true,
    disabledReasonTranslationKey: 'pages.swap.error.EURC_tokenUnavailable',
  },
  [FiatToken.ARS]: {
    enabled: true,
    disabledReasonTranslationKey: 'pages.swap.error.ARS_tokenUnavailable',
  },
  [FiatToken.BRL]: {
    enabled: true,
    disabledReasonTranslationKey: 'pages.swap.error.BRL_tokenUnavailable',
  },
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
