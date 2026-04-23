import { FiatToken } from "../tokens";

export interface SupportedFiatCurrency {
  symbol: FiatToken;
  name: string;
  decimals: number;
  enabled: boolean;
}

export type GetSupportedFiatCurrenciesRequest = Record<string, never>;

export interface GetSupportedFiatCurrenciesResponse {
  currencies: SupportedFiatCurrency[];
}

export const SUPPORTED_FIAT_CURRENCIES: SupportedFiatCurrency[] = [
  { decimals: 2, enabled: true, name: "Euro", symbol: FiatToken.EURC },
  { decimals: 2, enabled: true, name: "Brazilian Real", symbol: FiatToken.BRL },
  { decimals: 2, enabled: true, name: "Argentine Peso", symbol: FiatToken.ARS },
  { decimals: 2, enabled: true, name: "US Dollar", symbol: FiatToken.USD },
  { decimals: 2, enabled: false, name: "Mexican Peso", symbol: FiatToken.MXN },
  { decimals: 2, enabled: false, name: "Colombian Peso", symbol: FiatToken.COP }
];

export const isSupportedFiatCurrency = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  return SUPPORTED_FIAT_CURRENCIES.some(c => c.enabled && c.symbol === value.toUpperCase());
};
