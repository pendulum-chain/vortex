import { FiatToken } from "../tokens";

export interface SupportedCountry {
  name: string;
  countryCode: string;
  emoji: string;
  supportedCurrencies: FiatToken[];
  support: {
    buy: boolean;
    sell: boolean;
  };
}

export interface GetSupportedCountriesRequest {
  fiatCurrency?: FiatToken;
}

export interface GetSupportedCountriesResponse {
  countries: SupportedCountry[];
}

/**
 * EUR SELL: https://terms.mykobo.co/countries/allowed
 */

export const SUPPORTED_COUNTRIES: SupportedCountry[] = [
  {
    countryCode: "AU",
    emoji: "🇦🇺",
    name: "Australia",
    support: { buy: false, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "AT",
    emoji: "🇦🇹",
    name: "Austria",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "BE",
    emoji: "🇧🇪",
    name: "Belgium",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "BG",
    emoji: "🇧🇬",
    name: "Bulgaria",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "CA",
    emoji: "🇨🇦",
    name: "Canada",
    support: { buy: false, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "HR",
    emoji: "🇭🇷",
    name: "Croatia",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "CZ",
    emoji: "🇨🇿",
    name: "Czech Republic",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "DK",
    emoji: "🇩🇰",
    name: "Denmark",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "EE",
    emoji: "🇪🇪",
    name: "Estonia",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "FI",
    emoji: "🇫🇮",
    name: "Finland",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "FR",
    emoji: "🇫🇷",
    name: "France",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "DE",
    emoji: "🇩🇪",
    name: "Germany",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "GR",
    emoji: "🇬🇷",
    name: "Greece",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "GI",
    emoji: "🇬🇮",
    name: "Gibraltar",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "HU",
    emoji: "🇭🇺",
    name: "Hungary",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "IS",
    emoji: "🇮🇸",
    name: "Iceland",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "IE",
    emoji: "🇮🇪",
    name: "Ireland",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "IT",
    emoji: "🇮🇹",
    name: "Italy",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "LV",
    emoji: "🇱🇻",
    name: "Latvia",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "LI",
    emoji: "🇱🇮",
    name: "Liechtenstein",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "LT",
    emoji: "🇱🇹",
    name: "Lithuania",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "LU",
    emoji: "🇱🇺",
    name: "Luxembourg",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "ME",
    emoji: "🇲🇪",
    name: "Montenegro",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "NL",
    emoji: "🇳🇱",
    name: "Netherlands",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "NZ",
    emoji: "🇳🇿",
    name: "New Zealand",
    support: { buy: false, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "NO",
    emoji: "🇳🇴",
    name: "Norway",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "PL",
    emoji: "🇵🇱",
    name: "Poland",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "PT",
    emoji: "🇵🇹",
    name: "Portugal",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "RO",
    emoji: "🇷🇴",
    name: "Romania",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "SK",
    emoji: "🇸🇰",
    name: "Slovakia",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "SI",
    emoji: "🇸🇮",
    name: "Slovenia",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "ES",
    emoji: "🇪🇸",
    name: "Spain",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "SE",
    emoji: "🇸🇪",
    name: "Sweden",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "CH",
    emoji: "🇨🇭",
    name: "Switzerland",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "US",
    emoji: "🇺🇸",
    name: "United States",
    support: { buy: false, sell: true },
    supportedCurrencies: [FiatToken.EURC]
  },
  {
    countryCode: "BR",
    emoji: "🇧🇷",
    name: "Brazil",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.BRL]
  },
  {
    countryCode: "AR",
    emoji: "🇦🇷",
    name: "Argentina",
    support: { buy: true, sell: true },
    supportedCurrencies: [FiatToken.ARS]
  }
];
