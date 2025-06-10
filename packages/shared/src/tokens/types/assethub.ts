/**
 * AssetHub token types
 */

import { Networks } from '../../helpers';
import { BaseTokenDetails, PendulumDetails, TokenType } from './base';

export interface AssetHubTokenDetails extends BaseTokenDetails, PendulumDetails {
  type: TokenType.AssetHub;
  assetSymbol: string;
  networkAssetIcon: string;
  network: Networks;
  foreignAssetId: number;
}

export interface AssetHubTokenDetailsWithBalance extends AssetHubTokenDetails {
  balance: string;
}
