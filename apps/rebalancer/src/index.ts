import { cryptoWaitReady } from "@polkadot/util-crypto";
import { rebalanceBrlaToUsdcAxl } from "./rebalance/brla-to-axlusdc";
import { checkInitialPendulumBalance } from "./rebalance/brla-to-axlusdc/steps.ts";
import { getSwapPoolsWithCoverageRatio } from "./services/indexer";
import { getConfig, getPendulumAccount } from "./utils/config.ts";

const args = process.argv.slice(2);
const forceRestart = args.includes("--restart");
const manualAmount = args.find(arg => !arg.startsWith("--")) || null;

async function checkForRebalancing() {
  const config = getConfig();
  const amountAxlUsdc = manualAmount || config.rebalancingUsdToBrlAmount;

  if (forceRestart) {
    console.log("Force restart enabled. Starting rebalancing regardless of coverage ratios.");
  } else {
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

    if (
      brlaPool.coverageRatio >= 1 + config.rebalancingThreshold ||
      usdcAxlPool.coverageRatio <= 1 - config.rebalancingThreshold
    ) {
      console.log("Coverage ratios of BRLA and USDC.axl require rebalancing.");
    } else {
      console.log("Coverage ratios do not require rebalancing.");
      return;
    }
  }

  // Proceed with rebalancing
  await cryptoWaitReady();
  const pendulumAccount = getPendulumAccount();
  const rebalancerAccountBalance = await checkInitialPendulumBalance(pendulumAccount.address, amountAxlUsdc);
  if (config.rebalancingUsdToBrlMinBalance && rebalancerAccountBalance.lt(config.rebalancingUsdToBrlMinBalance)) {
    throw new Error(
      `Rebalancer account balance ${rebalancerAccountBalance} is below the minimum required balance of ${config.rebalancingUsdToBrlMinBalance} to perform rebalancing.`
    );
  }

  await rebalanceBrlaToUsdcAxl(amountAxlUsdc, forceRestart);
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
