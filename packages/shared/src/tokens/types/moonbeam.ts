/**
 * Moonbeam token types
 */

import { BaseFiatTokenDetails, BaseTokenDetails, PendulumDetails, TokenType } from "./base";

export interface MoonbeamTokenDetails extends BaseTokenDetails, PendulumDetails, BaseFiatTokenDetails {
  type: TokenType.Moonbeam;
  polygonErc20Address: string;
  moonbeamErc20Address: string;
  partnerUrl: string;
}
