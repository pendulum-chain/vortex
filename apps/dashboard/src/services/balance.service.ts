import { type EvmNetworks, type EvmTokenDetails, Networks } from "@vortexfi/shared";
import { formatUnits, hexToBigInt, parseUnits } from "viem";

const ALCHEMY_API_KEY: string | undefined = import.meta.env.VITE_ALCHEMY_API_KEY;
const NATIVE_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const ALCHEMY_NETWORK: Partial<Record<EvmNetworks, string>> = {
  [Networks.Arbitrum]: "arb-mainnet",
  [Networks.Avalanche]: "avax-mainnet",
  [Networks.Base]: "base-mainnet",
  [Networks.BSC]: "bsc-mainnet",
  [Networks.Ethereum]: "eth-mainnet",
  [Networks.Polygon]: "polygon-mainnet",
  // Sandbox runs offramps on Amoy; without this the funding gate can never read a balance.
  [Networks.PolygonAmoy]: "polygon-amoy"
};

interface AlchemyBalanceResponse {
  data?: {
    tokens?: Array<{ tokenAddress?: string | null; tokenBalance?: string }>;
  };
}

export interface TokenPortfolio {
  rawByAddress: Map<string, bigint>;
}

export interface TokenBalance {
  decimals: number;
  formatted: string;
  raw: bigint;
}

export function formatTokenBalance(raw: bigint, decimals: number, displayDecimals: number): string {
  const exact = formatUnits(raw, decimals);
  const [whole, fraction = ""] = exact.split(".");
  return `${whole}.${fraction.padEnd(displayDecimals, "0").slice(0, displayDecimals)}`;
}

export function parseTokenPortfolioResponse(response: AlchemyBalanceResponse): TokenPortfolio {
  const rawByAddress = new Map<string, bigint>();
  for (const entry of response.data?.tokens ?? []) {
    const address = (entry.tokenAddress ?? NATIVE_TOKEN_ADDRESS).toLowerCase();
    if (entry.tokenBalance) {
      rawByAddress.set(address, hexToBigInt(entry.tokenBalance as `0x${string}`));
    }
  }
  return { rawByAddress };
}

export function getTokenBalance(portfolio: TokenPortfolio, token: EvmTokenDetails): TokenBalance {
  const raw = portfolio.rawByAddress.get(token.erc20AddressSourceChain.toLowerCase()) ?? 0n;
  const displayDecimals = token.assetSymbol.toLowerCase().includes("usd") ? 2 : 6;
  return {
    decimals: token.decimals,
    formatted: formatTokenBalance(raw, token.decimals, displayDecimals),
    raw
  };
}

export function hasSufficientTokenBalance(balance: TokenBalance, requiredAmount: string): boolean {
  return balance.raw >= parseUnits(requiredAmount, balance.decimals);
}

export async function fetchTokenPortfolio(
  address: string,
  network: EvmNetworks,
  apiKey = ALCHEMY_API_KEY
): Promise<TokenPortfolio> {
  if (!apiKey) {
    throw new Error("Alchemy API key is not configured");
  }
  const alchemyNetwork = ALCHEMY_NETWORK[network];
  if (!alchemyNetwork) {
    throw new Error(`Alchemy balance lookup is not configured for ${network}`);
  }

  const response = await fetch(`https://api.g.alchemy.com/data/v1/${apiKey}/assets/tokens/balances/by-address`, {
    body: JSON.stringify({
      addresses: [{ address, networks: [alchemyNetwork] }],
      includeErc20Tokens: true,
      includeNativeTokens: true
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Balance request failed with status ${response.status}`);
  }

  return parseTokenPortfolioResponse((await response.json()) as AlchemyBalanceResponse);
}
