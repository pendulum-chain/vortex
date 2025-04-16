/**
 * Stellar token types
 */

import { BaseTokenDetails, BaseFiatTokenDetails, PendulumDetails, TokenType } from './base';

export interface StellarTokenDetails extends BaseTokenDetails, PendulumDetails, BaseFiatTokenDetails {
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
}
