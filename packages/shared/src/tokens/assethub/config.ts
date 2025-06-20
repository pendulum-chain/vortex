/**
 * AssetHub token configuration
 */

import { Networks } from "../../helpers";
import { PENDULUM_USDC_ASSETHUB } from "../constants/pendulum";
import { AssetHubTokenDetails } from "../types/assethub";
import { AssetHubToken, TokenType } from "../types/base";

export const assetHubTokenConfig: Record<AssetHubToken, AssetHubTokenDetails> = {
  [AssetHubToken.USDC]: {
    assetSymbol: "USDC",
    decimals: 6,
    isNative: false,
    network: Networks.AssetHub,
    networkAssetIcon: "assethubUSDC",
    type: TokenType.AssetHub,
    ...PENDULUM_USDC_ASSETHUB
  }
};
