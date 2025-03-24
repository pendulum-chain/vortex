/**
 * AssetHub token configuration
 */

import { AssetHubToken, TokenType } from '../types/base';
import { AssetHubTokenDetails } from '../types/assethub';
import { PENDULUM_USDC_ASSETHUB } from '../constants/pendulum';
import { Networks } from '../../../api/helpers/networks';

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
