export interface SupportedFiatCurrency {
  symbol: string;
  name: string;
  decimals: number;
}

export type GetSupportedFiatCurrenciesRequest = Record<string, never>;

export interface GetSupportedFiatCurrenciesResponse {
  currencies: SupportedFiatCurrency[];
}

export const SUPPORTED_FIAT_CURRENCIES: SupportedFiatCurrency[] = [
  {
    decimals: 2,
    name: "Euro",
    symbol: "EUR"
  },
  {
    decimals: 2,
    name: "Brazilian Real",
    symbol: "BRL"
  },
  {
    decimals: 2,
    name: "Argentine Peso",
    symbol: "ARS"
  }
];

export const isSupportedFiatCurrency = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const normalizedValue = value.toUpperCase();
  return SUPPORTED_FIAT_CURRENCIES.some(c => c.symbol === normalizedValue);
};
