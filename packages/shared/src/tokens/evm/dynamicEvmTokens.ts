import axios from "axios";
import { EvmNetworks, getNetworkId, isNetworkEVM, Networks } from "../../helpers/networks";
import { squidRouterConfigBase } from "../../services/squidrouter/config";
import { PENDULUM_USDC_AXL } from "../pendulum/config";
import { TokenType } from "../types/base";
import { EvmTokenDetails } from "../types/evm";
import { evmTokenConfig } from "./config";

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
  tokens: EvmTokenDetails[];
  tokensByNetwork: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>;
  isLoaded: boolean;
  error: Error | null;
  usedFallback: boolean;
}

const state: DynamicEvmTokensState = {
  error: null,
  isLoaded: false,
  tokens: [],
  tokensByNetwork: {} as Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>,
  usedFallback: false
};

function getNetworkFromChainId(chainId: string): Networks | null {
  const chainIdNum = parseInt(chainId, 10);
  const networkEntries = Object.entries(Networks).filter(
    ([_, network]) => typeof network === "string" && getNetworkId(network as Networks) === chainIdNum
  );
  return networkEntries.length > 0 ? (networkEntries[0][1] as Networks) : null;
}

function isNativeToken(address: string): boolean {
  return address === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
}

function getNetworkAssetIcon(network: Networks, symbol: string): string {
  const networkName = network.toLowerCase();
  const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `${networkName}${cleanSymbol}`;
}

function mapSquidTokenToEvmTokenDetails(token: SquidRouterToken): EvmTokenDetails | null {
  const network = getNetworkFromChainId(token.chainId);
  if (!network || !isNetworkEVM(network)) {
    return null;
  }

  const isNative = isNativeToken(token.address);

  const erc20Address: `0x${string}` = isNative
    ? ("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as `0x${string}`)
    : (token.address as `0x${string}`);

  return {
    assetSymbol: token.symbol,
    decimals: token.decimals,
    erc20AddressSourceChain: erc20Address,
    isNative,
    logoURI: token.logoURI,
    network,
    networkAssetIcon: getNetworkAssetIcon(network, token.symbol),
    pendulumRepresentative: PENDULUM_USDC_AXL,
    type: TokenType.Evm,
    usdPrice: token.usdPrice
  };
}

async function fetchSquidRouterTokens(): Promise<SquidRouterToken[]> {
  const result = await axios.get("https://v2.api.squidrouter.com/v2/tokens", {
    headers: {
      "x-integrator-id": squidRouterConfigBase.integratorId
    }
  });
  return result.data.tokens;
}

function groupTokensByNetwork(tokens: EvmTokenDetails[]): Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>> {
  const grouped = {} as Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>;

  for (const network of Object.values(Networks)) {
    if (isNetworkEVM(network)) {
      grouped[network as EvmNetworks] = {};
    }
  }

  for (const token of tokens) {
    if (isNetworkEVM(token.network)) {
      const network = token.network as EvmNetworks;
      if (!grouped[network]) {
        grouped[network] = {};
      }
      grouped[network][token.assetSymbol] = token;
    }
  }

  // Merge. Precedence to static config.
  for (const network of Object.values(Networks)) {
    if (isNetworkEVM(network)) {
      const evmNetwork = network as EvmNetworks;
      const networkTokenConfig = evmTokenConfig[evmNetwork];
      if (networkTokenConfig) {
        grouped[evmNetwork] = {
          ...grouped[evmNetwork],
          ...networkTokenConfig
        };
      }
    }
  }

  return grouped;
}

function buildFallbackFromStaticConfig(): {
  tokens: EvmTokenDetails[];
  tokensByNetwork: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>;
} {
  const tokens: EvmTokenDetails[] = [];
  const tokensByNetwork = {} as Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>;

  for (const network of Object.values(Networks)) {
    if (isNetworkEVM(network)) {
      const evmNetwork = network as EvmNetworks;
      const networkTokenConfig = evmTokenConfig[evmNetwork];
      if (networkTokenConfig) {
        tokensByNetwork[evmNetwork] = networkTokenConfig;
        const networkTokens = Object.values(networkTokenConfig).filter(
          (token): token is EvmTokenDetails => token !== undefined
        );
        tokens.push(...networkTokens);
      }
    }
  }

  return { tokens, tokensByNetwork };
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
    //.slice(0, 500); // TODO TESTING Limit to first 500 tokens to avoid overload

    state.tokens = evmTokens;
    state.tokensByNetwork = groupTokensByNetwork(evmTokens);
    state.error = null;
    state.usedFallback = false;
    state.isLoaded = true;

    console.log(`[DynamicEvmTokens] Loaded ${evmTokens.length} tokens from SquidRouter`);
  } catch (err) {
    console.error("[DynamicEvmTokens] Failed to fetch tokens from SquidRouter, using fallback:", err);

    const fallback = buildFallbackFromStaticConfig();
    state.tokens = fallback.tokens;
    state.tokensByNetwork = fallback.tokensByNetwork;
    state.error = err instanceof Error ? err : new Error("Failed to fetch tokens");
    state.usedFallback = true;
    state.isLoaded = true;
  }
}

/**
 * Get the EVM token config with the same structure as the static evmTokenConfig.
 * This is a drop-in replacement for evmTokenConfig usage.
 */
export function getEvmTokenConfig(): Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>> {
  if (!state.isLoaded) {
    console.warn("[DynamicEvmTokens] Tokens not yet loaded, returning static config");
    return evmTokenConfig as Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>;
  }
  return state.tokensByNetwork;
}

/**
 * Get all EVM tokens for a specific network.
 */
export function getEvmTokensForNetwork(network: EvmNetworks): EvmTokenDetails[] {
  if (!state.isLoaded) {
    console.warn("[DynamicEvmTokens] Tokens not yet loaded, returning static config for network");
    return Object.values(evmTokenConfig[network] ?? {}).filter((token): token is EvmTokenDetails => token !== undefined);
  }
  return Object.values(state.tokensByNetwork[network] ?? {}).filter((token): token is EvmTokenDetails => token !== undefined);
}

/**
 * Get all loaded EVM tokens as a flat array.
 */
export function getAllEvmTokens(): EvmTokenDetails[] {
  if (!state.isLoaded) {
    console.warn("[DynamicEvmTokens] Tokens not yet loaded, returning static config tokens");
    const fallback = buildFallbackFromStaticConfig();
    return fallback.tokens;
  }
  return state.tokens;
}

/**
 * Check if tokens have been loaded.
 */
export function isTokensLoaded(): boolean {
  return state.isLoaded;
}

/**
 * Check if the service used the fallback static config.
 */
export function usedFallbackConfig(): boolean {
  return state.usedFallback;
}

/**
 * Get the error if token loading failed.
 */
export function getLoadingError(): Error | null {
  return state.error;
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

  const normalizedSymbol = symbol.toUpperCase();

  // Search through all tokens to find matching symbol
  const token = state.tokens.find(t => t.assetSymbol.toUpperCase() === normalizedSymbol);

  return token?.usdPrice;
}
