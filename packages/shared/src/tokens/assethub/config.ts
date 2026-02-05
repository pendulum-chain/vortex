/**
 * AssetHub token configuration
 */

import { Networks } from "../../helpers";
import { PENDULUM_USDC_ASSETHUB } from "../pendulum/config";
import { AssetHubTokenDetails } from "../types/assethub";
import { AssetHubToken, TokenType } from "../types/base";

export const assetHubTokenConfig: Record<AssetHubToken, AssetHubTokenDetails> = {
  [AssetHubToken.USDC]: {
    assetSymbol: "USDC",
    decimals: 6,
    foreignAssetId: 1337,
    hydrationId: "22",
    isNative: false,
    logoURI: "https://raw.githubusercontent.com/0xsquid/assets/main/images/tokens/usdc.svg",
    network: Networks.AssetHub,
    pendulumRepresentative: PENDULUM_USDC_ASSETHUB,
    type: TokenType.AssetHub
  },
  [AssetHubToken.USDT]: {
    assetSymbol: "USDT",
    decimals: 6,
    foreignAssetId: 1984,
    hydrationId: "10",
    isNative: false,
    logoURI: "https://raw.githubusercontent.com/0xsquid/assets/main/images/tokens/usdt.svg",
    network: Networks.AssetHub,
    pendulumRepresentative: PENDULUM_USDC_ASSETHUB, // This is because USDC is used by Nabla
    type: TokenType.AssetHub
  },
  [AssetHubToken.DOT]: {
    assetSymbol: "DOT",
    decimals: 10,
    hydrationId: "5",
    isNative: true,
    logoURI: "https://raw.githubusercontent.com/0xsquid/assets/main/images/tokens/dot.svg",
    network: Networks.AssetHub,
    pendulumRepresentative: PENDULUM_USDC_ASSETHUB, // This is because USDC is used by Nabla
    type: TokenType.AssetHub
  }
};
