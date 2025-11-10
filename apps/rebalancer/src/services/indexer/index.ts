import { getConfig } from "../../utils/config.ts";
import { fetchLatestBlockFromIndexer, fetchNablaInstance } from "./graphql.ts";

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
