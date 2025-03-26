/**
 * Moonbeam token types
 */

import { BaseTokenDetails, BaseFiatTokenDetails, PendulumDetails, TokenType } from './base';

export interface MoonbeamTokenDetails extends BaseTokenDetails, PendulumDetails, BaseFiatTokenDetails {
  type: TokenType.Moonbeam;
  polygonErc20Address: string;
  moonbeamErc20Address: string;
  partnerUrl: string;
}
