/**
 * Moonbeam token types
 */

import { BaseFiatTokenDetails, BaseTokenDetails, TokenType } from "./base";
import {PendulumTokenDetails} from "../types/pendulum";

export interface MoonbeamTokenDetails extends BaseTokenDetails, BaseFiatTokenDetails {
  type: TokenType.Moonbeam;
  polygonErc20Address: string;
  moonbeamErc20Address: string;
  partnerUrl: string;
  pendulumRepresentative: PendulumTokenDetails;
}
