import axios from "axios";
import { EvmNetworks, getNetworkId, isNetworkEVM, Networks } from "../../helpers/networks";
import logger from "../../logger";
import { squidRouterConfigBase } from "../../services/squidrouter/config";
import { PENDULUM_USDC_AXL } from "../pendulum/config";
import { TokenType } from "../types/base";
import { EvmTokenDetails } from "../types/evm";
import { evmTokenConfig } from "./config";

const SQUID_ROUTER_API_URL = "https://v2.api.squidrouter.com/v2/tokens";

// Token filtering configuration to exclude irrelevant tokens from EVM chains
const TOKEN_FILTER_CONFIG = {
  // Bridged token patterns to exclude (Cosmos tokens bridged via Axelar)
  // Allows major axl* tokens (axlUSDC, axlUSDT, axlETH, axlWBTC) but blocks others
  excludedBridgedPatterns: [/^axl(?!USDC|USDT|ETH|WETH|WBTC|DAI)/i],
  // Explicit symbol blocklist - Cosmos/non-EVM native tokens that shouldn't appear on EVM chains
  symbolBlocklist: new Set(["HUAHUA", "OSMO", "ATOM", "LUNA", "UST", "SCRT", "JUNO", "STARS", "AKT", "REGEN", "KUJI", "INJ"])
};

interface SquidRouterToken {
  symbol: string;
  address: string;
  chainId: string;
  name: string;
  decimals: number;
  coingeckoId: string;
  type: string;
  logoURI: string;
  subGraphOnly: boolean;
  subGraphIds: string[];
  isTestnet: boolean;
  usdPrice: number;
}

interface DynamicEvmTokensState {
  tokensByNetwork: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>;
  priceBySymbol: Map<string, number>;
  isLoaded: boolean;
}

const state: DynamicEvmTokensState = {
  isLoaded: false,
  priceBySymbol: new Map(),
  tokensByNetwork: {} as Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>
};

/**
 * Iterates over all EVM networks and calls the callback for each.
 */
function forEachEvmNetwork(callback: (network: EvmNetworks) => void): void {
  for (const network of Object.values(Networks)) {
    if (isNetworkEVM(network)) {
      callback(network as EvmNetworks);
    }
  }
}

function createEmptyNetworkBuckets(): Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>> {
  const buckets = {} as Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>;
  forEachEvmNetwork(network => {
    buckets[network] = {};
  });
  return buckets;
}

const NATIVE_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;

function isNativeToken(address: string): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS;
}

function getNetworkFromChainId(chainId: string): Networks | null {
  const chainIdNum = parseInt(chainId, 10);
  const networkEntries = Object.entries(Networks).filter(
    ([_, network]) => typeof network === "string" && getNetworkId(network as Networks) === chainIdNum
  );
  return networkEntries.length > 0 ? (networkEntries[0][1] as Networks) : null;
}

function shouldIncludeToken(token: SquidRouterToken): boolean {
  const symbol = token.symbol.toUpperCase();

  // Exclude blocklisted tokens (Cosmos native tokens)
  if (TOKEN_FILTER_CONFIG.symbolBlocklist.has(symbol)) {
    return false;
  }

  // Exclude most bridged Axelar tokens except major stablecoins
  for (const pattern of TOKEN_FILTER_CONFIG.excludedBridgedPatterns) {
    if (pattern.test(token.symbol)) {
      return false;
    }
  }

  return true;
}

function generateFallbackLogoURI(chainId: number, address: string): string {
  return `https://raw.githubusercontent.com/0xsquid/assets/main/images/migration/webp/${chainId}_${address.toLowerCase()}.webp`;
}

function mapSquidTokenToEvmTokenDetails(token: SquidRouterToken): EvmTokenDetails | null {
  const network = getNetworkFromChainId(token.chainId);
  if (!network || !isNetworkEVM(network)) {
    return null;
  }

  if (!shouldIncludeToken(token)) {
    return null;
  }

  const isNative = isNativeToken(token.address);

  const erc20Address = token.address as `0x${string}`;

  return {
    assetSymbol: token.symbol,
    decimals: token.decimals,
    erc20AddressSourceChain: erc20Address,
    fallbackLogoURI: generateFallbackLogoURI(parseInt(token.chainId, 10), token.address),
    isNative,
    logoURI: token.logoURI,
    network,
    pendulumRepresentative: PENDULUM_USDC_AXL,
    type: TokenType.Evm,
    usdPrice: token.usdPrice
  };
}

/**
 * Groups tokens by their network into a record keyed by EvmNetworks.
 * This function only groups - it does not merge with static config.
 */
function groupTokensByNetwork(tokens: EvmTokenDetails[]): Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>> {
  const grouped = createEmptyNetworkBuckets();

  for (const token of tokens) {
    const network = token.network as EvmNetworks;
    grouped[network][token.assetSymbol.toUpperCase()] = token;
  }

  return grouped;
}

/**
 * Merges dynamic tokens with static config.
 * Static config takes priority for contract addresses, but preserves useful metadata
 * (logoURI, usdPrice) from dynamic tokens.
 * Preserves the static config keys (enum values) for proper lookups.
 */
function mergeWithStaticConfig(
  dynamicTokens: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>
): Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>> {
  const merged = createEmptyNetworkBuckets();

  forEachEvmNetwork(network => {
    merged[network] = { ...dynamicTokens[network] };

    const networkTokenConfig = evmTokenConfig[network];
    if (!networkTokenConfig) return;

    // Iterate over entries to preserve the static config key (enum value)
    for (const [staticTokenKey, staticToken] of Object.entries(networkTokenConfig)) {
      if (!staticToken) continue;

      const normalizedSymbol = staticToken.assetSymbol.toUpperCase();
      const dynamicToken = dynamicTokens[network][normalizedSymbol];

      if (dynamicToken) {
        // Warning if addresses point to different contracts (possible configuration drift or scam token)
        if (staticToken.erc20AddressSourceChain.toLowerCase() !== dynamicToken.erc20AddressSourceChain.toLowerCase()) {
          logger.current.warn(
            `[DynamicEvmTokens] Address mismatch for ${normalizedSymbol} on ${network}. Config: ${staticToken.erc20AddressSourceChain}, Dynamic: ${dynamicToken.erc20AddressSourceChain}. Using Config preference.`
          );
        }

        // Static token exists and dynamic token exists - merge, static takes priority, mark as static
        const mergedToken = {
          ...staticToken,
          fallbackLogoURI: dynamicToken.fallbackLogoURI ?? staticToken.fallbackLogoURI,
          isFromStaticConfig: true,
          logoURI: staticToken.logoURI ?? dynamicToken.logoURI,
          usdPrice: dynamicToken.usdPrice ?? staticToken.usdPrice
        };

        // Store under the static config key (enum value) for proper enum-based lookups
        merged[network][staticTokenKey] = mergedToken;

        // Also store under normalized symbol if different from the key, for symbol-based lookups
        if (normalizedSymbol !== staticTokenKey) {
          merged[network][normalizedSymbol] = mergedToken;
        }
      } else {
        // Static token exists but no dynamic token - use static as-is, mark as static
        const staticTokenWithFlag = {
          ...staticToken,
          isFromStaticConfig: true
        };

        // Store under the static config key (enum value)
        merged[network][staticTokenKey] = staticTokenWithFlag;

        // Also store under normalized symbol if different from the key
        if (normalizedSymbol !== staticTokenKey) {
          merged[network][normalizedSymbol] = staticTokenWithFlag;
        }
      }
    }
  });

  return merged;
}

function buildPriceLookup(tokensByNetwork: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>): Map<string, number> {
  const priceMap = new Map<string, number>();

  forEachEvmNetwork(network => {
    const networkTokens = tokensByNetwork[network];
    for (const token of Object.values(networkTokens)) {
      if (token?.usdPrice !== undefined) {
        priceMap.set(token.assetSymbol.toUpperCase(), token.usdPrice);
      }
    }
  });

  return priceMap;
}

async function fetchSquidRouterTokens(): Promise<SquidRouterToken[]> {
  const result = await axios.get(SQUID_ROUTER_API_URL, {
    headers: {
      "x-integrator-id": squidRouterConfigBase.integratorId
    }
  });
  return result.data.tokens;
}

function buildFallbackFromStaticConfig(): Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>> {
  const tokensByNetwork = createEmptyNetworkBuckets();

  forEachEvmNetwork(network => {
    const networkTokenConfig = evmTokenConfig[network];
    if (networkTokenConfig) {
      tokensByNetwork[network] = { ...networkTokenConfig };
    }
  });

  return tokensByNetwork;
}

/**
 * Derives a flat array of all tokens from the tokensByNetwork structure.
 * Use this instead of storing a separate tokens array.
 */
function deriveAllTokens(tokensByNetwork: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>): EvmTokenDetails[] {
  return Object.values(tokensByNetwork)
    .flatMap(networkTokens => Object.values(networkTokens))
    .filter((token): token is EvmTokenDetails => token !== undefined);
}

/**
 * Initialize the dynamic EVM tokens service.
 * Call this once at app startup before React renders.
 * This function is idempotent - calling it multiple times is safe.
 */
export async function initializeEvmTokens(): Promise<void> {
  if (state.isLoaded) {
    return;
  }

  try {
    const squidTokens = await fetchSquidRouterTokens();
    const evmTokens = squidTokens
      .map(mapSquidTokenToEvmTokenDetails)
      .filter((token): token is EvmTokenDetails => token !== null);

    const groupedTokens = groupTokensByNetwork(evmTokens);
    state.tokensByNetwork = mergeWithStaticConfig(groupedTokens);
    state.priceBySymbol = buildPriceLookup(state.tokensByNetwork);
    state.isLoaded = true;
  } catch (err) {
    console.error("[DynamicEvmTokens] Failed to fetch tokens from SquidRouter, using fallback:", err);

    state.tokensByNetwork = buildFallbackFromStaticConfig();
    state.priceBySymbol = buildPriceLookup(state.tokensByNetwork);
    state.isLoaded = true;
  }
}

/**
 * Get the EVM token config with the same structure as the static evmTokenConfig.
 * This is a drop-in replacement for evmTokenConfig usage.
 */
export function getEvmTokenConfig(): Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>> {
  if (!state.isLoaded) {
    return evmTokenConfig as Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>;
  }
  return state.tokensByNetwork;
}

/**
 * Get all EVM tokens for a specific network.
 */
export function getEvmTokensForNetwork(network: EvmNetworks): EvmTokenDetails[] {
  if (!state.isLoaded) {
    return Object.values(evmTokenConfig[network] ?? {}).filter((token): token is EvmTokenDetails => token !== undefined);
  }
  return Object.values(state.tokensByNetwork[network] ?? {}).filter((token): token is EvmTokenDetails => token !== undefined);
}

/**
 * Get all loaded EVM tokens as a flat array.
 */
export function getAllEvmTokens(): EvmTokenDetails[] {
  if (!state.isLoaded) {
    return deriveAllTokens(buildFallbackFromStaticConfig());
  }
  return deriveAllTokens(state.tokensByNetwork);
}

/**
 * Get the USD price for a token by its symbol.
 * Returns undefined if the token is not found or has no price.
 *
 * @param symbol - The token symbol (e.g., 'ETH', 'USDC', 'MATIC')
 * @returns The USD price or undefined if not available
 */
export function getTokenUsdPrice(symbol: string): number | undefined {
  if (!state.isLoaded) {
    return undefined;
  }

  return state.priceBySymbol.get(symbol.toUpperCase());
}
