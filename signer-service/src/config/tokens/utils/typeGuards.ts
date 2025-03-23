/**
 * Type guards for token configuration
 */

import { TokenType } from '../types/base';
import { EvmTokenDetails } from '../types/evm';
import { AssetHubTokenDetails } from '../types/assethub';
import { StellarTokenDetails } from '../types/stellar';
import { MoonbeamTokenDetails } from '../types/moonbeam';

export type TokenDetails = EvmTokenDetails | AssetHubTokenDetails | StellarTokenDetails | MoonbeamTokenDetails;
export type OnChainTokenDetails = EvmTokenDetails | AssetHubTokenDetails;
export type FiatTokenDetails = StellarTokenDetails | MoonbeamTokenDetails;

/**
 * Type guard for EVM tokens
 */
export function isEvmToken(token: TokenDetails): token is EvmTokenDetails {
  return token.type === TokenType.Evm;
}

/**
 * Type guard for AssetHub tokens
 */
export function isAssetHubToken(token: TokenDetails): token is AssetHubTokenDetails {
  return token.type === TokenType.AssetHub;
}

/**
 * Type guard for Stellar tokens
 */
export function isStellarToken(token: TokenDetails): token is StellarTokenDetails {
  return token.type === TokenType.Stellar;
}

/**
 * Type guard for Moonbeam tokens
 */
export function isMoonbeamToken(token: TokenDetails): token is MoonbeamTokenDetails {
  return token.type === TokenType.Moonbeam;
}

/**
 * Type guard for on-chain tokens
 */
export function isOnChainToken(token: TokenDetails): token is OnChainTokenDetails {
  return isEvmToken(token) || isAssetHubToken(token);
}

/**
 * Type guard for fiat tokens
 */
export function isFiatToken(token: TokenDetails): token is FiatTokenDetails {
  return isStellarToken(token) || isMoonbeamToken(token);
}

/**
 * Type guard for Stellar output token details
 */
export function isStellarOutputTokenDetails(
  tokenDetails: StellarTokenDetails | MoonbeamTokenDetails,
): tokenDetails is StellarTokenDetails {
  return tokenDetails.type === TokenType.Stellar;
}

/**
 * Type guard for Moonbeam output token details
 */
export function isMoonbeamOutputTokenDetails(
  outputTokenDetails: StellarTokenDetails | MoonbeamTokenDetails,
): outputTokenDetails is MoonbeamTokenDetails {
  return outputTokenDetails.type === TokenType.Moonbeam;
}
