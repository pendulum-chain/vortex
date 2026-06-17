import { ERC20_BRLA_BASE, EvmClientManager, NABLA_ROUTER_BASE_BRLA, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { getConfig } from "../../utils/config.ts";
import { fetchLatestBlockFromIndexer, fetchNablaInstance } from "./graphql.ts";

const SWAP_POOL_ABI = [
  {
    inputs: [],
    name: "reserve",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalLiabilities",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

const ROUTER_ABI = [
  {
    inputs: [{ name: "asset", type: "address" }],
    name: "poolByAsset",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

export async function getBaseNablaCoverageRatio(): Promise<
  { brlaCoverageRatio: number; usdcCoverageRatio: number } | undefined
> {
  try {
    const evmClientManager = EvmClientManager.getInstance();
    const baseClient = evmClientManager.getClient(Networks.Base);

    const brlaPoolAddress = (await baseClient.readContract({
      abi: ROUTER_ABI,
      address: NABLA_ROUTER_BASE_BRLA,
      args: [ERC20_BRLA_BASE],
      functionName: "poolByAsset"
    })) as `0x${string}`;

    if (brlaPoolAddress === "0x0000000000000000000000000000000000000000") {
      console.error(`No BRLA pool found on Base Nabla router (${NABLA_ROUTER_BASE_BRLA}) for asset ${ERC20_BRLA_BASE}.`);
      return undefined;
    }
    const [brlaReserve, brlaLiabilities] = await Promise.all([
      baseClient.readContract({
        abi: SWAP_POOL_ABI,
        address: brlaPoolAddress,
        functionName: "reserve"
      }) as Promise<bigint>,
      baseClient.readContract({
        abi: SWAP_POOL_ABI,
        address: brlaPoolAddress,
        functionName: "totalLiabilities"
      }) as Promise<bigint>
    ]);

    const brlaCoverageRatio =
      brlaLiabilities > 0n ? new Big(brlaReserve.toString()).div(new Big(brlaLiabilities.toString())).toNumber() : 0;

    console.log(`Base Nabla BRLA pool coverage ratio: ${brlaCoverageRatio}`);

    return { brlaCoverageRatio, usdcCoverageRatio: 0 };
  } catch (error) {
    console.error("Failed to fetch Base Nabla coverage ratio:", error);
    return undefined;
  }
}

/// This function retrieves all swap pools from the Nabla instance and checks their coverage ratios.
/// If the coverage ratio of a pool is below the specified threshold, it adds that pool to the list of non-sufficient pools.
/// @param coverageRatioThreshold - The threshold for the coverage ratio to consider it sufficient. Default is 0.5.
export async function getSwapPoolsWithCoverageRatio() {
  const latestBlock = await fetchLatestBlockFromIndexer();
  // Check if the timestamp of the latest block is within the last minute to ensure the data is fresh
  if (!latestBlock || !latestBlock.timestamp) {
    throw Error("Failed to fetch latest block or timestamp is missing");
  }

  const config = getConfig();

  const currentTime = Date.now();
  const blockTime = new Date(latestBlock.timestamp).getTime();
  if (currentTime - blockTime > config.indexerFreshnessThresholdMinutes * 60 * 1000) {
    throw Error(
      `Latest block returned from indexer is older than ${config.indexerFreshnessThresholdMinutes} minutes, data may not be fresh`
    );
  }

  const nablaInstance = await fetchNablaInstance();
  if (!nablaInstance || !nablaInstance.swapPools) {
    throw Error("Failed to fetch Nabla instance or swap pools are missing");
  }

  const swapPoolsWithCoverage = [];
  for (const pool of nablaInstance.swapPools) {
    const reserve = pool.reserve;
    const liabilities = pool.totalLiabilities;
    const coverageRatio = reserve && liabilities ? reserve / liabilities : 0;

    console.log(`Checking coverage ratio for pool ${pool.token.symbol}: ${coverageRatio}`);

    swapPoolsWithCoverage.push({ coverageRatio, pool });
  }

  return swapPoolsWithCoverage;
}
