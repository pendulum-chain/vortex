/**
 * Free token configuration (not bound to any network)
 */

import { PENDULUM_USDC_ASSETHUB } from "../pendulum/config";
import { FiatCurrencyDetails, FiatToken, TokenType } from "../types/base";

export const freeTokenConfig: Partial<Record<FiatToken, FiatCurrencyDetails>> = {
  [FiatToken.USD]: {
    assetSymbol: "USD",
    decimals: 1,
    fiat: {
      assetIcon: "usd",
      name: "US Dollar",
      symbol: "USD"
    }, // TODO find these values with Alfredpay
    maxBuyAmountRaw: "10000000000",
    maxSellAmountRaw: "100000000000000000000",
    minBuyAmountRaw: "1",
    minSellAmountRaw: "0.01",
    type: TokenType.Fiat
  }
};
