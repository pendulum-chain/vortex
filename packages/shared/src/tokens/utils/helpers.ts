/**
 * Helper functions for token configuration
 */

import { EvmNetworks, isNetworkEVM, Networks } from "../../helpers";
import logger from "../../logger";
import { assetHubTokenConfig } from "../assethub/config";
import {
  ERC20_EURE_POLYGON_DECIMALS,
  ERC20_EURE_POLYGON_TOKEN_NAME,
  ERC20_EURE_POLYGON_V1,
  ERC20_EURE_POLYGON_V2
} from "../constants/misc";
import { evmTokenConfig } from "../evm/config";
import { getEvmTokenConfig } from "../evm/dynamicEvmTokens";
import { freeTokenConfig } from "../freeTokens/config";
import { moonbeamTokenConfig } from "../moonbeam/config";
import { PENDULUM_USDC_AXL } from "../pendulum/config";
import { stellarTokenConfig } from "../stellar/config";
import { AssetHubToken, FiatToken, OnChainToken, OnChainTokenSymbol, RampCurrency, TokenType } from "../types/base";
import { EvmToken, EvmTokenDetails } from "../types/evm";
import { MoonbeamTokenDetails } from "../types/moonbeam";
import { PendulumTokenDetails } from "../types/pendulum";
import { normalizeTokenSymbol } from "./normalization";
import { FiatTokenDetails, OnChainTokenDetails } from "./typeGuards";

const MONERIUM_EURE_POLYGON_ADDRESSES = new Set([ERC20_EURE_POLYGON_V1.toLowerCase(), ERC20_EURE_POLYGON_V2.toLowerCase()]);

/**
 * Get token details for a specific network and token
 */
export function getOnChainTokenDetails(
  network: Networks,
  onChainToken: OnChainTokenSymbol,
  dynamicEvmTokenConfig?: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>
): OnChainTokenDetails | undefined {
  const normalizedOnChainToken = normalizeTokenSymbol(onChainToken);

  try {
    if (network === Networks.AssetHub) {
      return assetHubTokenConfig[normalizedOnChainToken as AssetHubToken];
    } else {
      if (isNetworkEVM(network)) {
        const evmNetwork = network as EvmNetworks;
        // Use provided config, or get dynamic config, or fallback to static config
        // TODO what is best... pass it on the context or use directly this all the time?
        const configToUse = dynamicEvmTokenConfig ?? getEvmTokenConfig();
        const networkTokens = configToUse[evmNetwork] as Record<string, EvmTokenDetails>;
        return networkTokens[normalizedOnChainToken];
      } else throw new Error(`Network ${network} is not a valid EVM origin network`);
    }
  } catch (error) {
    logger.current.error(`Error getting input token details: ${error}`);
    throw error;
  }
}

/**
 * Resolve an EVM token by contract address on a specific network.
 */
export function getEvmTokenDetailsByAddress(
  network: EvmNetworks,
  tokenAddress: `0x${string}`,
  dynamicEvmTokenConfig?: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>
): EvmTokenDetails | undefined {
  const normalizedTokenAddress = tokenAddress.toLowerCase();
  const configToUse = dynamicEvmTokenConfig ?? getEvmTokenConfig();

  const configuredToken = Object.values(configToUse[network] ?? {}).find(
    (token): token is EvmTokenDetails =>
      token !== undefined && token.erc20AddressSourceChain.toLowerCase() === normalizedTokenAddress
  );
  if (configuredToken) {
    return configuredToken;
  }

  if (network === Networks.Polygon && MONERIUM_EURE_POLYGON_ADDRESSES.has(normalizedTokenAddress)) {
    return {
      assetSymbol: ERC20_EURE_POLYGON_TOKEN_NAME,
      decimals: ERC20_EURE_POLYGON_DECIMALS,
      erc20AddressSourceChain: tokenAddress,
      isNative: false,
      network: Networks.Polygon,
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    };
  }

  return undefined;
}

/**
 * Get token details for a specific network and token, with fallback to default
 */
export function getOnChainTokenDetailsOrDefault(
  network: Networks,
  onChainToken: OnChainTokenSymbol,
  dynamicEvmTokenConfig?: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>
): OnChainTokenDetails {
  // AXLUSDC doesn't exist Ethereum
  if (onChainToken === EvmToken.AXLUSDC && network === Networks.Ethereum) {
    const usdcDetails = getOnChainTokenDetails(network, EvmToken.USDC, dynamicEvmTokenConfig);
    if (usdcDetails) {
      return usdcDetails;
    }
  }

  const maybeOnChainTokenDetails = getOnChainTokenDetails(network, onChainToken, dynamicEvmTokenConfig);
  if (maybeOnChainTokenDetails) {
    return maybeOnChainTokenDetails;
  }

  if (network === Networks.AssetHub) {
    const firstAvailableToken = Object.values(assetHubTokenConfig)[0];
    if (!firstAvailableToken) {
      throw new Error(`No tokens configured for network ${network}`);
    }
    return firstAvailableToken;
  } else {
    if (isNetworkEVM(network)) {
      const firstAvailableToken = Object.values(evmTokenConfig[network])[0];
      if (!firstAvailableToken) {
        throw new Error(`No tokens configured for network ${network}`);
      }
      return firstAvailableToken;
    } else throw new Error(`Network ${network} is not a valid EVM origin network`);
  }
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
 * Get any fiat token details (Moonbeam or free token)
 */
export function getAnyFiatTokenDetails(fiatToken: FiatToken): FiatTokenDetails {
  const tokenDetails = moonbeamTokenConfig[fiatToken] || freeTokenConfig[fiatToken];
  if (!tokenDetails) {
    throw new Error(`Invalid fiat token type: ${fiatToken}. Token type is not Moonbeam.`);
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
  if (tokenDetails.type === TokenType.Fiat) {
    throw new Error(`Invalid token type: ${tokenDetails.type}. Fiat currency does not have pendulum representative.`);
  }
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

  if (!tokenDetails || tokenDetails.type === TokenType.Fiat) {
    throw new Error("Invalid token provided for pendulum details.");
  }

  return tokenDetails.pendulumRepresentative;
}
