/**
 * AssetHub token configuration
 */

import { AssetHubToken, TokenType } from '../types/base';
import { AssetHubTokenDetails } from '../types/assethub';
import { Networks } from '../constants/networks';
import { PENDULUM_USDC_ASSETHUB } from '../constants/pendulum';

export const assetHubTokenConfig: Record<AssetHubToken, AssetHubTokenDetails> = {
  [AssetHubToken.USDC]: {
    assetSymbol: 'USDC',
    networkAssetIcon: 'assethubUSDC',
    decimals: 6,
    network: Networks.AssetHub,
    type: TokenType.AssetHub,
    ...PENDULUM_USDC_ASSETHUB,
  },
};
