import {
  ALCHEMY_API_KEY,
  doesNetworkSupportRamp,
  EvmNetworks,
  EvmTokenDetails,
  getAllEvmTokens,
  isNetworkEVM,
  Networks
} from "@vortexfi/shared";
import Big from "big.js";
import { hexToBigInt } from "viem";
import { multiplyByPowerOfTen } from "../../helpers/contracts";
import { getEvmTokenConfig } from "../tokens";
import { BalanceMap, getBalanceKey, TokenBalance } from "./types";

const ALCHEMY_NETWORK_MAP: Partial<Record<Networks, string>> = {
  [Networks.Arbitrum]: "arb-mainnet",
  [Networks.Avalanche]: "avax-mainnet",
  [Networks.Base]: "base-mainnet",
  [Networks.BSC]: "bsc-mainnet",
  [Networks.Ethereum]: "eth-mainnet",
  [Networks.Moonbeam]: "moonbeam-mainnet",
  [Networks.Polygon]: "polygon-mainnet"
};

async function fetchAlchemyBalances(address: string, network: Networks): Promise<Map<string, string>> {
  const networkName = ALCHEMY_NETWORK_MAP[network];
  if (!networkName || !ALCHEMY_API_KEY) {
    return new Map();
  }

  try {
    const response = await fetch(`https://api.g.alchemy.com/data/v1/${ALCHEMY_API_KEY}/assets/tokens/balances/by-address`, {
      body: JSON.stringify({
        addresses: [{ address, networks: [networkName] }],
        includeErc20Tokens: true,
        includeNativeTokens: true
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    const data = await response.json();
    const balanceMap = new Map<string, string>();

    if (data.data?.tokens) {
      for (const token of data.data.tokens) {
        const tokenAddress = token.tokenAddress || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
        const key = `${network}-${tokenAddress.toLowerCase()}`;
        const decimalBalance = hexToBigInt(token.tokenBalance as `0x${string}`).toString();
        balanceMap.set(key, decimalBalance);
      }
    }

    return balanceMap;
  } catch (error) {
    console.error(`Error fetching Alchemy balances for ${network}:`, error);
    return new Map();
  }
}

function getAllSupportedEvmTokens(): EvmTokenDetails[] {
  const evmConfig = getEvmTokenConfig();
  const tokens: EvmTokenDetails[] = [];
  const evmNetworks = Object.values(Networks).filter(isNetworkEVM).filter(doesNetworkSupportRamp) as EvmNetworks[];

  for (const network of evmNetworks) {
    const networkConfig = evmConfig[network];
    if (networkConfig) {
      const networkTokens = Object.values(networkConfig).filter((t): t is EvmTokenDetails => t !== undefined);
      tokens.push(...networkTokens);
    }
  }

  return tokens;
}

function buildEvmTokenLookup(): Map<string, EvmTokenDetails> {
  const allEvmTokens = getAllEvmTokens();
  const map = new Map<string, EvmTokenDetails>();
  for (const token of allEvmTokens) {
    if (token.erc20AddressSourceChain) {
      const key = `${token.network}-${token.erc20AddressSourceChain.toLowerCase()}`;
      map.set(key, token);
    }
  }
  return map;
}

export async function fetchEvmBalances(evmAddress: string): Promise<BalanceMap> {
  const newBalances = new Map<string, TokenBalance>();
  const evmTokenLookup = buildEvmTokenLookup();
  const evmTokens = getAllSupportedEvmTokens();

  const evmNetworks = [...new Set(evmTokens.map(t => t.network))].filter(isNetworkEVM) as Networks[];
  const networkResults = await Promise.all(evmNetworks.map(network => fetchAlchemyBalances(evmAddress, network)));

  const allEvmBalances = new Map<string, string>();
  for (const result of networkResults) {
    result.forEach((value, key) => allEvmBalances.set(key, value));
  }

  for (const token of evmTokens) {
    const addressKey = `${token.network}-${token.erc20AddressSourceChain?.toLowerCase()}`;
    const rawBalance = allEvmBalances.get(addressKey);

    const showDecimals = token.assetSymbol.toLowerCase().includes("usd") ? 2 : 6;
    const balance = rawBalance ? multiplyByPowerOfTen(Big(rawBalance), -token.decimals).toFixed(showDecimals, 0) : "0.00";

    const matchingToken = evmTokenLookup.get(addressKey);
    const usdPrice = matchingToken?.usdPrice ?? 0;
    const balanceUsd = usdPrice > 0 ? Big(balance).times(usdPrice).toFixed(2, 0) : "0.00";

    const balanceKey = getBalanceKey(token.network, token.assetSymbol);
    newBalances.set(balanceKey, { balance, balanceUsd });
  }

  return newBalances;
}
