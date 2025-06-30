/**
 * Moonbeam token configuration
 */

import { PENDULUM_BRLA_MOONBEAM } from "../constants/pendulum";
import { FiatToken, TokenType } from "../types/base";
import { MoonbeamTokenDetails } from "../types/moonbeam";

export const moonbeamTokenConfig: Partial<Record<FiatToken, MoonbeamTokenDetails>> = {
  [FiatToken.BRL]: {
    assetSymbol: "BRL",
    decimals: 18,
    fiat: {
      assetIcon: "brl",
      name: "Brazilian Real",
      symbol: "BRL"
    },
    maxWithdrawalAmountRaw: "150000000000000000000000",
    minWithdrawalAmountRaw: "3000000000000000000",
    moonbeamErc20Address: "0xfeb25f3fddad13f82c4d6dbc1481516f62236429",
    offrampFeesBasisPoints: 0,
    offrampFeesFixedComponent: 0.75, // 3 BRL.
    onrampFeesBasisPoints: 0, // 150,000 BRL. We put this as an artificial limit to avoid too high amounts.
    onrampFeesFixedComponent: 0.75,
    partnerUrl: "https://brla.digital", // 0.75 BRL
    pendulumRepresentative: PENDULUM_BRLA_MOONBEAM,
    polygonErc20Address: "0xe6a537a407488807f0bbeb0038b79004f19dddfb", // 0.75 BRL
    type: TokenType.Moonbeam
  }
};
