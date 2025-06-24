/**
 * Stellar token types
 */

import { BaseFiatTokenDetails, BaseTokenDetails, TokenType } from "./base";
import {PendulumTokenDetails} from "@packages/shared/tokens";

export interface StellarTokenDetails extends BaseTokenDetails, BaseFiatTokenDetails {
  type: TokenType.Stellar;
  stellarAsset: {
    code: {
      hex: string;
      string: string; // Stellar (3 or 4 letter) representation
    };
    issuer: {
      hex: string;
      stellarEncoding: string;
    };
  };
  vaultAccountId: string;
  supportsClientDomain: boolean;
  anchorHomepageUrl: string;
  tomlFileUrl: string;
  usesMemo: boolean;
  pendulumRepresentative: PendulumTokenDetails;
}
