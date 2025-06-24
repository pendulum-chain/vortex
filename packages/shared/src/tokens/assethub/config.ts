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
    foreignAssetId: PENDULUM_USDC_ASSETHUB.foreignAssetId,
    isNative: false,
    network: Networks.AssetHub,
    networkAssetIcon: "assethubUSDC",
    pendulumRepresentative: PENDULUM_USDC_ASSETHUB,
    type: TokenType.AssetHub
  }
};
