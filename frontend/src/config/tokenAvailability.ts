import { FiatToken } from 'shared';
import { DEFAULT_FIAT_TOKEN } from '../stores/ramp/useRampFormStore';

export interface TokenAvailabilityConfig {
  enabled: boolean;
  disabledReason?: string;
}

// This is our central configuration for token availability
export const fiatTokenAvailability: Record<FiatToken, TokenAvailabilityConfig> = {
  [FiatToken.EURC]: {
    enabled: false,
    disabledReason: 'Improving your EUR exit - back shortly! ',
  },
  [FiatToken.ARS]: {
    enabled: true,
  },
  [FiatToken.BRL]: {
    enabled: true,
  },
};

export function isFiatTokenEnabled(token: FiatToken): boolean {
  return fiatTokenAvailability[token]?.enabled ?? false;
}

export function isFiatTokenDisabled(token: FiatToken): boolean {
  return fiatTokenAvailability[token]?.enabled === false;
}

export function getTokenDisabledReason(token: FiatToken): string | undefined {
  return fiatTokenAvailability[token]?.disabledReason;
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
