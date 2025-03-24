/**
 * AssetHub token types
 */

import { BaseTokenDetails, PendulumDetails, TokenType } from './base';
import { Networks } from '../../../api/helpers/networks';

export interface AssetHubTokenDetails extends BaseTokenDetails, PendulumDetails {
  type: TokenType.AssetHub;
  assetSymbol: string;
  networkAssetIcon: string;
  network: Networks;
  foreignAssetId: number;
}
