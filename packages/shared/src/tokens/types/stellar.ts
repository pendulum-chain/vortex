/**
 * Stellar token types
 */

import { PendulumTokenDetails } from "../types/pendulum";
import { BaseFiatTokenDetails, BaseTokenDetails, TokenType } from "./base";

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
