import { FiatCurrencyDetails, FiatToken, TokenType } from "../types/base";

export const eurcMykoboTokenConfig: Partial<Record<FiatToken, FiatCurrencyDetails>> = {
  [FiatToken.EURC]: {
    assetSymbol: "EUR",
    decimals: 2,
    fiat: {
      assetIcon: "eur",
      name: "Euro",
      symbol: "EUR"
    },
    maxBuyAmountRaw: "1000000",
    maxSellAmountRaw: "1000000",
    minBuyAmountRaw: "2500",
    minSellAmountRaw: "2500",
    type: TokenType.Fiat
  }
};
