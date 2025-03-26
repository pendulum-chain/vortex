/**
 * Type guards for token configuration
 */

import { AssetHubToken, FiatToken, TokenType } from '../types/base';
import { EvmToken, EvmTokenDetails } from '../types/evm';
import { AssetHubTokenDetails } from '../types/assethub';
import { StellarTokenDetails } from '../types/stellar';
import { MoonbeamTokenDetails } from '../types/moonbeam';

export type TokenDetails = EvmTokenDetails | AssetHubTokenDetails | StellarTokenDetails | MoonbeamTokenDetails;
export type OnChainTokenDetails = EvmTokenDetails | AssetHubTokenDetails;
export type FiatTokenDetails = StellarTokenDetails | MoonbeamTokenDetails;

/**
 * Type guard for EVM tokens
 */
export function isEvmTokenDetails(token: TokenDetails): token is EvmTokenDetails {
  return token.type === TokenType.Evm;
}

/**
 * Type guard for AssetHub tokens
 */
export function isAssetHubTokenDetails(token: TokenDetails): token is AssetHubTokenDetails {
  return token.type === TokenType.AssetHub;
}

/**
 * Type guard for Stellar tokens
 */
export function isStellarTokenDetails(token: TokenDetails): token is StellarTokenDetails {
  return token.type === TokenType.Stellar;
}

/**
 * Type guard for Moonbeam tokens
 */
export function isMoonbeamTokenDetails(token: TokenDetails): token is MoonbeamTokenDetails {
  return token.type === TokenType.Moonbeam;
}

/**
 * Type guard for on-chain tokens
 */
export function isOnChainTokenDetails(token: TokenDetails): token is OnChainTokenDetails {
  return isEvmTokenDetails(token) || isAssetHubTokenDetails(token);
}

/**
 * Type guard for fiat tokens
 */
export function isFiatTokenDetails(token: TokenDetails): token is FiatTokenDetails {
  return isStellarTokenDetails(token) || isMoonbeamTokenDetails(token);
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

export function isFiatToken(token: string): token is FiatToken {
  return Object.values(FiatToken).includes(token.toLowerCase() as FiatToken);
}

export function isAssetHubToken(token: string): token is AssetHubToken {
  return Object.values(AssetHubToken).includes(token.toLowerCase() as AssetHubToken);
}

export function isEvmToken(token: string): token is EvmToken {
  return Object.values(EvmToken).includes(token.toLowerCase() as EvmToken);
}

export function isOnChainToken(token: string): token is EvmToken | AssetHubToken {
  return isEvmToken(token) || isAssetHubToken(token);
}
