/**
 * Free token configuration (not bound to any network)
 */

import { PENDULUM_USDC_ASSETHUB } from "../pendulum/config";
import { FiatToken, FreeTokenDetails, TokenType } from "../types/base";

export const freeTokenConfig: Partial<Record<FiatToken, FreeTokenDetails>> = {
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
    minSellAmountRaw: "1",
    pendulumRepresentative: PENDULUM_USDC_ASSETHUB,
    type: TokenType.Fiat
  }
};
