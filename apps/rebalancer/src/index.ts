import { rebalanceBrlaToUsdcAxl } from "./rebalance/brla-to-axlusdc";
import { checkInitialPendulumBalance } from "./rebalance/brla-to-axlusdc/steps.ts";
import { getSwapPoolsWithCoverageRatio } from "./services/indexer";
import { getConfig, getPendulumAccount } from "./utils/config.ts";

async function checkForRebalancing() {
  const swapPoolsWithCoverage = await getSwapPoolsWithCoverageRatio();

  // For now, we can only handle automatic rebalancing for USDC.axl and BRLA
  const brlaPool = swapPoolsWithCoverage.find(pool => pool.pool.token.symbol === "BRLA");
  if (!brlaPool) {
    console.log("No BRLA swap pool found.");
    return;
  }
  const usdcAxlPool = swapPoolsWithCoverage.find(pool => pool.pool.token.symbol === "USDC.axl");
  if (!usdcAxlPool) {
    console.log("No USDC.axl swap pool found.");
    return;
  }

  const config = getConfig();
  if (brlaPool.coverageRatio >= 1 + config.rebalancingThreshold && usdcAxlPool.coverageRatio <= 1) {
    console.log("Coverage ratios of BRLA and USDC.axl require rebalancing.");
    // Proceed with rebalancing
    const amountAxlUsdc = config.rebalancingUsdToBrlAmount;

    const pendulumAccount = getPendulumAccount();
    const rebalancerAccountBalance = await checkInitialPendulumBalance(pendulumAccount.address, amountAxlUsdc);
    if (config.rebalancingUsdToBrlMinBalance && rebalancerAccountBalance.lt(config.rebalancingUsdToBrlMinBalance)) {
      throw new Error(
        `Rebalancer account balance ${rebalancerAccountBalance} is below the minimum required balance of ${config.rebalancingUsdToBrlMinBalance} to perform rebalancing.`
      );
    }

    await rebalanceBrlaToUsdcAxl(amountAxlUsdc);
  }
}

checkForRebalancing()
  .then(() => {
    console.log("Rebalancing process completed successfully.");
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
