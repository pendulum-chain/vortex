import { fetchLatestBlockFromIndexer, fetchNablaInstance } from "./graphql.ts";

const INDEXER_FRESHNESS_THRESHOLD_MINUTES = process.env.INDEXER_FRESHNESS_THRESHOLD_MINUTES
  ? Number(process.env.INDEXER_FRESHNESS_THRESHOLD_MINUTES)
  : 5;

/// This function retrieves all swap pools from the Nabla instance and checks their coverage ratios.
/// If the coverage ratio of a pool is below the specified threshold, it adds that pool to the list of non-sufficient pools.
/// @param coverageRatioThreshold - The threshold for the coverage ratio to consider it sufficient. Default is 0.5.
export async function getSwapPoolsWithCoverageRatio() {
  const latestBlock = await fetchLatestBlockFromIndexer();
  // Check if the timestamp of the latest block is within the last minute to ensure the data is fresh
  if (!latestBlock || !latestBlock.timestamp) {
    throw Error("Failed to fetch latest block or timestamp is missing");
  }

  const currentTime = Date.now();
  const blockTime = new Date(latestBlock.timestamp).getTime();
  if (currentTime - blockTime > INDEXER_FRESHNESS_THRESHOLD_MINUTES * 60 * 1000) {
    throw Error(
      `Latest block returned from indexer is older than ${INDEXER_FRESHNESS_THRESHOLD_MINUTES} minutes, data may not be fresh`
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
