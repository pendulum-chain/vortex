/**
 * Moonbeam token types
 */

import { PendulumTokenDetails } from "../types/pendulum";
import { BaseFiatTokenDetails, BaseTokenDetails, TokenType } from "./base";

export interface MoonbeamTokenDetails extends BaseTokenDetails, BaseFiatTokenDetails {
  type: TokenType.Moonbeam;
  polygonErc20Address: string;
  moonbeamErc20Address: `0x${string}`;
  partnerUrl: string;
  pendulumRepresentative: PendulumTokenDetails;
}
