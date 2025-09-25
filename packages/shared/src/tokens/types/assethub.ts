/**
 * AssetHub token types
 */

import { Networks } from "../../helpers";
import { PendulumTokenDetails } from "../types/pendulum";
import { BaseTokenDetails, TokenType } from "./base";

export interface AssetHubTokenDetails extends BaseTokenDetails {
  type: TokenType.AssetHub;
  assetSymbol: string;
  networkAssetIcon: string;
  network: Networks;
  foreignAssetId?: number;
  hydrationId: string;
  isNative: boolean;
  pendulumRepresentative: PendulumTokenDetails;
}

export interface AssetHubTokenDetailsWithBalance extends AssetHubTokenDetails {
  balance: string;
}
