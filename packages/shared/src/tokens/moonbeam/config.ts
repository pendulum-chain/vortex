/**
 * Moonbeam token configuration
 */

import { Networks } from "../../helpers";
import { AXL_USDC_MOONBEAM, PENDULUM_BRLA_MOONBEAM, PENDULUM_USDC_AXL } from "../constants/pendulum";
import { FiatToken, TokenType } from "../types/base";
import { EvmTokenDetails } from "../types/evm";
import { MoonbeamTokenDetails } from "../types/moonbeam";

export const AXL_USDC_MOONBEAM_DETAILS: EvmTokenDetails = {
  assetSymbol: "axlUSDC",
  decimals: 6,
  erc20AddressSourceChain: AXL_USDC_MOONBEAM,
  isNative: false,
  network: Networks.Moonbeam,
  networkAssetIcon: "moonbeamUSDC",
  pendulumRepresentative: PENDULUM_USDC_AXL,
  type: TokenType.Evm
};

export const moonbeamTokenConfig: Partial<Record<FiatToken, MoonbeamTokenDetails>> = {
  [FiatToken.BRL]: {
    assetSymbol: "BRL",
    buyFeesBasisPoints: 0,
    buyFeesFixedComponent: 0.75,
    decimals: 18,
    fiat: {
      assetIcon: "brl",
      name: "Brazilian Real",
      symbol: "BRL"
    },
    maxBuyAmountRaw: "150000000000000000000000",
    maxSellAmountRaw: "150000000000000000000000",
    minBuyAmountRaw: "3000000000000000000",
    minSellAmountRaw: "3000000000000000000",
    moonbeamErc20Address: "0xfeb25f3fddad13f82c4d6dbc1481516f62236429", // 3 BRL.
    partnerUrl: "https://brla.digital", // 150,000 BRL. We put this as an artificial limit to avoid too high amounts.
    pendulumRepresentative: PENDULUM_BRLA_MOONBEAM,
    polygonErc20Address: "0xe6a537a407488807f0bbeb0038b79004f19dddfb", // 0.75 BRL
    sellFeesBasisPoints: 0,
    sellFeesFixedComponent: 0.75, // 0.75 BRL
    type: TokenType.Moonbeam
  }
};
