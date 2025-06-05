/**
 * AssetHub token configuration
 */

import { Networks } from '../../helpers';
import { PENDULUM_USDC_ASSETHUB } from '../constants/pendulum';
import { AssetHubTokenDetails } from '../types/assethub';
import { AssetHubToken, TokenType } from '../types/base';

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
