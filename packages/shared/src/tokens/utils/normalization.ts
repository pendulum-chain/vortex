import { Networks } from "../../helpers";
import { AssetHubToken, OnChainToken } from "../types/base";
import { EvmToken } from "../types/evm";

/**
 * Normalizes token symbols to uppercase for consistent lookup
 * @param token - Token symbol to normalize
 * @returns Uppercase token symbol
 */
export function normalizeTokenSymbol(token: string): string {
  return token.toUpperCase().trim();
}

/**
 * Normalizes network names to proper case for consistent lookup
 * @param network - Network name to normalize
 * @returns Normalized Networks enum value or undefined if invalid
 */
export function normalizeNetworkName(network: string): Networks | undefined {
  const normalized = network.toLowerCase().trim();
  return Object.values(Networks).find(n => n.toLowerCase() === normalized);
}

/**
 * Creates a standardized key for token lookups
 * @param token - OnChain token to create key for
 * @returns Standardized uppercase key
 */
export function createTokenKey(token: OnChainToken): string {
  return normalizeTokenSymbol(token);
}

/**
 * Safely converts a string to EvmToken enum
 * @param token - Token string to convert
 * @returns EvmToken enum value or undefined if invalid
 */
export function toEvmToken(token: string): EvmToken | undefined {
  const normalized = normalizeTokenSymbol(token);
  return Object.values(EvmToken).includes(normalized as EvmToken) ? (normalized as EvmToken) : undefined;
}

/**
 * Safely converts a string to AssetHubToken enum
 * @param token - Token string to convert
 * @returns AssetHubToken enum value or undefined if invalid
 */
export function toAssetHubToken(token: string): AssetHubToken | undefined {
  const normalized = normalizeTokenSymbol(token);
  return Object.values(AssetHubToken).includes(normalized as AssetHubToken) ? (normalized as AssetHubToken) : undefined;
}

/**
 * Safely converts a string to OnChainToken enum
 * @param token - Token string to convert
 * @returns OnChainToken enum value or undefined if invalid
 */
export function toOnChainToken(token: string): OnChainToken | undefined {
  return toEvmToken(token) || toAssetHubToken(token);
}
