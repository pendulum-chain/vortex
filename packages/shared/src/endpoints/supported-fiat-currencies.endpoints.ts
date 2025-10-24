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
