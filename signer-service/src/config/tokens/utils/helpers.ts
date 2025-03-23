/**
 * Helper functions for token configuration
 */

import { FiatToken } from '../types/base';
import { Networks } from '../constants/networks';
import { EvmToken } from '../types/evm';
import { AssetHubToken } from '../types/base';
import { TokenDetails, OnChainTokenDetails, FiatTokenDetails } from './typeGuards';
import { evmTokenConfig } from '../evm/config';
import { assetHubTokenConfig } from '../assethub/config';
import { stellarTokenConfig } from '../stellar/config';
import { moonbeamTokenConfig } from '../moonbeam/config';
import { MoonbeamTokenDetails } from '../types/moonbeam';

/**
 * Get token details for a specific network and token
 */
export function getOnChainTokenDetails(
  network: Networks,
  onChainToken: EvmToken | AssetHubToken,
): OnChainTokenDetails | undefined {
  const networkType = (network.charAt(0).toUpperCase() + network.slice(1)) as Networks;

  try {
    if (networkType === Networks.AssetHub) {
      return assetHubTokenConfig[onChainToken as AssetHubToken];
    } else {
      return evmTokenConfig[networkType][onChainToken as EvmToken];
    }
  } catch (error) {
    console.error(`Error getting input token details: ${error}`);
    throw error;
  }
}

/**
 * Get token details for a specific network and token, with fallback to default
 */
export function getOnChainTokenDetailsOrDefault(
  network: Networks,
  onChainToken: EvmToken | AssetHubToken,
): OnChainTokenDetails {
  const maybeOnChainTokenDetails = getOnChainTokenDetails(network, onChainToken);
  if (maybeOnChainTokenDetails) {
    return maybeOnChainTokenDetails;
  }

  console.error(`Invalid input token type: ${onChainToken}`);
  const networkType = (network.charAt(0).toUpperCase() + network.slice(1)) as Networks;

  if (networkType === Networks.AssetHub) {
    const firstAvailableToken = Object.values(assetHubTokenConfig)[0];
    if (!firstAvailableToken) {
      throw new Error(`No tokens configured for network ${networkType}`);
    }
    return firstAvailableToken;
  } else {
    const firstAvailableToken = Object.values(evmTokenConfig[networkType])[0];
    if (!firstAvailableToken) {
      throw new Error(`No tokens configured for network ${networkType}`);
    }
    return firstAvailableToken;
  }
}

/**
 * Get Stellar token details for a specific fiat token
 */
export function getTokenDetailsSpacewalk(fiatToken: FiatToken): FiatTokenDetails {
  const maybeOutputTokenDetails = stellarTokenConfig[fiatToken];

  if (maybeOutputTokenDetails) {
    return maybeOutputTokenDetails;
  }
  throw new Error(`Invalid fiat token type: ${fiatToken}. Token type is not Stellar.`);
}

/**
 * Get Moonbeam token details for a specific fiat token
 */
export function getAnyFiatTokenDetailsMoonbeam(fiatToken: FiatToken): MoonbeamTokenDetails {
  const maybeOutputTokenDetails = moonbeamTokenConfig[fiatToken];

  if (maybeOutputTokenDetails) {
    return maybeOutputTokenDetails;
  }
  throw new Error(`Invalid output token type: ${fiatToken}. Token type is not Moonbeam.`);
}

/**
 * Get any fiat token details (Stellar or Moonbeam)
 */
export function getAnyFiatTokenDetails(fiatToken: FiatToken): FiatTokenDetails {
  return (stellarTokenConfig[fiatToken] || moonbeamTokenConfig[fiatToken])!;
}

/**
 * Get enum key by string value
 */
export function getEnumKeyByStringValue<T extends { [key: string]: string }>(
  enumObj: T,
  value: string,
): T[keyof T] | undefined {
  const key = Object.keys(enumObj).find((k) => enumObj[k as keyof T] === value) as keyof T | undefined;
  return key ? enumObj[key] : undefined;
}

/**
 * Check if a token is a fiat token
 */
export function isFiatTokenEnum(token: string): token is FiatToken {
  return Object.values(FiatToken).includes(token as FiatToken);
}

/**
 * Get Pendulum currency ID for a fiat token
 */
export function getPendulumCurrencyId(fiatToken: FiatToken) {
  const tokenDetails = getAnyFiatTokenDetails(fiatToken);
  return tokenDetails.pendulumCurrencyId;
}

/**
 * Get Pendulum details for a token
 */
export function getPendulumDetails(tokenType: EvmToken | AssetHubToken | FiatToken, network: Networks) {
  const tokenDetails = isFiatTokenEnum(tokenType)
    ? getAnyFiatTokenDetails(tokenType)
    : getOnChainTokenDetailsOrDefault(network, tokenType as EvmToken | AssetHubToken);

  if (!tokenDetails) {
    throw new Error('Invalid token provided for pendulum details.');
  }

  return {
    pendulumErc20WrapperAddress: tokenDetails.pendulumErc20WrapperAddress,
    pendulumCurrencyId: tokenDetails.pendulumCurrencyId,
    pendulumAssetSymbol: tokenDetails.pendulumAssetSymbol,
    pendulumDecimals: tokenDetails.pendulumDecimals,
  };
}
