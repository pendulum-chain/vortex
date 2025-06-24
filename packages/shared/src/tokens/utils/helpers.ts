/**
 * Helper functions for token configuration
 */

import { EvmNetworks, Networks } from "../../helpers";
import { assetHubTokenConfig } from "../assethub/config";
import { evmTokenConfig } from "../evm/config";
import { moonbeamTokenConfig } from "../moonbeam/config";
import { stellarTokenConfig } from "../stellar/config";
import { AssetHubToken, FiatToken, OnChainToken, RampCurrency } from "../types/base";
import { EvmToken } from "../types/evm";
import { MoonbeamTokenDetails } from "../types/moonbeam";
import { PendulumTokenDetails } from "../types/pendulum";
import { StellarTokenDetails } from "../types/stellar";
import { FiatTokenDetails, OnChainTokenDetails } from "./typeGuards";

/**
 * Get token details for a specific network and token
 */
export function getOnChainTokenDetails(network: Networks, onChainToken: OnChainToken): OnChainTokenDetails | undefined {
  try {
    if (network === Networks.AssetHub) {
      return assetHubTokenConfig[onChainToken as AssetHubToken];
    } else {
      if (!(network in evmTokenConfig)) {
        throw new Error(`Network ${network} is not a valid EVM origin network`);
      }
      return evmTokenConfig[network as EvmNetworks][onChainToken as EvmToken];
    }
  } catch (error) {
    console.error(`Error getting input token details: ${error}`);
    throw error;
  }
}

/**
 * Get token details for a specific network and token, with fallback to default
 */
export function getOnChainTokenDetailsOrDefault(network: Networks, onChainToken: OnChainToken): OnChainTokenDetails {
  const maybeOnChainTokenDetails = getOnChainTokenDetails(network, onChainToken);
  if (maybeOnChainTokenDetails) {
    return maybeOnChainTokenDetails;
  }

  console.error(`Invalid input token type: ${onChainToken}`);
  if (network === Networks.AssetHub) {
    const firstAvailableToken = Object.values(assetHubTokenConfig)[0];
    if (!firstAvailableToken) {
      throw new Error(`No tokens configured for network ${network}`);
    }
    return firstAvailableToken;
  } else {
    if (!(network in evmTokenConfig)) {
      throw new Error(`Network ${network} is not a valid EVM origin network`);
    }
    const firstAvailableToken = Object.values(evmTokenConfig[network as EvmNetworks])[0];
    if (!firstAvailableToken) {
      throw new Error(`No tokens configured for network ${network}`);
    }

    return firstAvailableToken;
  }
}

/**
 * Get Stellar token details for a specific fiat token
 */
export function getTokenDetailsSpacewalk(fiatToken: FiatToken): StellarTokenDetails {
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
  const tokenDetails = stellarTokenConfig[fiatToken] || moonbeamTokenConfig[fiatToken];
  if (!tokenDetails) {
    throw new Error(`Invalid fiat token type: ${fiatToken}. Token type is not Stellar or Moonbeam.`);
  }
  return tokenDetails;
}

/**
 * Get enum key by string value
 */
export function getEnumKeyByStringValue<T extends { [key: string]: string }>(
  enumObj: T,
  value: string
): T[keyof T] | undefined {
  const key = Object.keys(enumObj).find(k => enumObj[k as keyof T] === value) as keyof T | undefined;
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
  return tokenDetails.pendulumRepresentative.currencyId;
}

/**
 * Get Pendulum details for a token
 */
export function getPendulumDetails(tokenType: RampCurrency, network?: Networks): PendulumTokenDetails {
  const tokenDetails = isFiatTokenEnum(tokenType)
    ? getAnyFiatTokenDetails(tokenType)
    : network
      ? getOnChainTokenDetailsOrDefault(network, tokenType as OnChainToken)
      : undefined;

  if (!tokenDetails) {
    throw new Error("Invalid token provided for pendulum details.");
  }

  return tokenDetails.pendulumRepresentative;
}
