import { cryptoWaitReady } from "@polkadot/util-crypto";
import { multiplyByPowerOfTen } from "@vortexfi/shared";
import Big from "big.js";
import { rebalanceBrlaToUsdcAxl } from "./rebalance/brla-to-axlusdc";
import { checkInitialPendulumBalance } from "./rebalance/brla-to-axlusdc/steps.ts";
import { rebalanceBrlaToUsdcBase } from "./rebalance/brla-to-usdc-base";
import { checkInitialBrlaBalanceOnBase } from "./rebalance/brla-to-usdc-base/steps.ts";
import { rebalanceUsdcBrlaUsdcBase } from "./rebalance/usdc-brla-usdc-base";
import { wouldExceedDailyBridgeLimit } from "./rebalance/usdc-brla-usdc-base/guards.ts";
import { checkInitialUsdcBalanceOnBase } from "./rebalance/usdc-brla-usdc-base/steps.ts";
import { getBaseNablaCoverageRatio, getSwapPoolsWithCoverageRatio } from "./services/indexer";
import {
  BrlaToAxlUsdcStateManager,
  BrlaToUsdcBaseRebalancePhase,
  BrlaToUsdcBaseStateManager,
  RebalancePhase,
  UsdcBaseRebalancePhase,
  UsdcBaseStateManager
} from "./services/stateManager.ts";
import { getConfig, getPendulumAccount } from "./utils/config.ts";

const args = process.argv.slice(2);
const forceRestart = args.includes("--restart");
const useLegacy = args.includes("--legacy");
const manualAmount = args.find(arg => !arg.startsWith("--")) || null;
const routeArg = args.find(arg => arg.startsWith("--route="));
const forcedRoute = routeArg ? (routeArg.split("=")[1] as "squidrouter" | "avenia" | "nabla-main") : undefined;
if (forcedRoute && !["squidrouter", "avenia", "nabla-main"].includes(forcedRoute)) {
  console.error("Invalid --route value. Must be 'squidrouter', 'avenia', or 'nabla-main'.");
  process.exit(1);
}

async function checkForRebalancingLegacy() {
  const config = getConfig();
  const amountAxlUsdc = manualAmount || config.rebalancingUsdToBrlAmount;

  if (forceRestart) {
    console.log("Force restart enabled. Starting legacy rebalancing regardless of coverage ratios.");
  } else {
    const swapPoolsWithCoverage = await getSwapPoolsWithCoverageRatio();

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

    if (brlaPool.coverageRatio >= 1 + config.rebalancingThreshold && usdcAxlPool.coverageRatio <= 1) {
      console.log("Coverage ratios of BRLA and USDC.axl require rebalancing.");
    } else {
      console.log("Coverage ratios do not require rebalancing.");
      return;
    }
  }

  await cryptoWaitReady();
  const pendulumAccount = getPendulumAccount();

  const stateManager = new BrlaToAxlUsdcStateManager();
  const state = await stateManager.getState();
  const isResuming = !forceRestart && state && state.currentPhase !== RebalancePhase.Idle;

  if (!isResuming) {
    const rebalancerAccountBalance = await checkInitialPendulumBalance(pendulumAccount.address, amountAxlUsdc);
    if (config.rebalancingUsdToBrlMinBalance && rebalancerAccountBalance.lt(config.rebalancingUsdToBrlMinBalance)) {
      throw new Error(
        `Rebalancer account balance ${rebalancerAccountBalance} is below the minimum required balance of ${config.rebalancingUsdToBrlMinBalance} to perform rebalancing.`
      );
    }
  }

  await rebalanceBrlaToUsdcAxl(amountAxlUsdc, forceRestart);
}

async function getTodayBridgedUsdRaw(): Promise<Big> {
  const usdcStateManager = new UsdcBaseStateManager();
  const brlaStateManager = new BrlaToUsdcBaseStateManager();

  const [usdcHistory, brlaHistory] = await Promise.all([usdcStateManager.getHistory(), brlaStateManager.getHistory()]);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  return [...usdcHistory, ...brlaHistory]
    .filter(e => new Date(e.startingTime) >= todayStart)
    .reduce((sum, e) => sum.plus(Big(e.initialAmount)), Big(0));
}

function checkDailyLimit(bridgedToday: Big, requestedAmountRaw: Big, dailyLimitRaw: Big, dailyLimitUsd: number): boolean {
  if (wouldExceedDailyBridgeLimit(bridgedToday, requestedAmountRaw, dailyLimitRaw)) {
    const projectedTotal = bridgedToday.plus(requestedAmountRaw);
    console.log(
      `Daily bridge limit reached: projected $${projectedTotal.div(1e6).toFixed(2)}, limit $${dailyLimitUsd}. Skipping.`
    );
    return true;
  }
  return false;
}

async function runUsdcToBrla(bridgedToday: Big, dailyLimitRaw: Big) {
  const config = getConfig();
  const amountUsdc = manualAmount || config.rebalancingUsdToBrlAmount;
  const amountUsdcRaw = multiplyByPowerOfTen(new Big(amountUsdc), 6).toFixed(0, 0);

  const stateManager = new UsdcBaseStateManager();
  const state = await stateManager.getState();
  const isResuming = !forceRestart && state && state.currentPhase !== UsdcBaseRebalancePhase.Idle;

  if (!isResuming) {
    if (checkDailyLimit(bridgedToday, Big(amountUsdcRaw), dailyLimitRaw, config.rebalancingDailyBridgeLimitUsd)) return;
    await checkInitialUsdcBalanceOnBase(amountUsdcRaw);
  }

  await rebalanceUsdcBrlaUsdcBase(amountUsdcRaw, forceRestart, forcedRoute);
}

async function runBrlaToUsdc(bridgedToday: Big, dailyLimitRaw: Big) {
  const config = getConfig();
  const amountBrla = manualAmount || config.rebalancingBrlToUsdAmount;
  const amountBrlaRaw = multiplyByPowerOfTen(new Big(amountBrla), 18).toFixed(0, 0);

  const stateManager = new BrlaToUsdcBaseStateManager();
  const state = await stateManager.getState();
  const isResuming = !forceRestart && state && state.currentPhase !== BrlaToUsdcBaseRebalancePhase.Idle;

  if (!isResuming) {
    const estimatedUsdcRaw = multiplyByPowerOfTen(new Big(amountBrla), 6).toFixed(0, 0);
    if (checkDailyLimit(bridgedToday, Big(estimatedUsdcRaw), dailyLimitRaw, config.rebalancingDailyBridgeLimitUsd)) return;

    const rebalancerBrlaBalance = await checkInitialBrlaBalanceOnBase(amountBrlaRaw);
    if (config.rebalancingBrlToUsdMinBalance && rebalancerBrlaBalance.lt(config.rebalancingBrlToUsdMinBalance)) {
      throw new Error(
        `Rebalancer BRLA balance ${rebalancerBrlaBalance} is below the minimum required balance of ${config.rebalancingBrlToUsdMinBalance} to perform BRLA->USDC rebalancing.`
      );
    }
  }

  await rebalanceBrlaToUsdcBase(amountBrlaRaw, forceRestart);
}

async function checkForRebalancing() {
  const config = getConfig();
  const coverage = await getBaseNablaCoverageRatio();

  if (!coverage && !forceRestart) {
    throw new Error("Failed to fetch Base Nabla coverage ratio.");
  }

  if (!forceRestart && coverage) {
    const inRange =
      coverage.brlaCoverageRatio >= config.rebalancingThreshold &&
      coverage.brlaCoverageRatio >= 1 - config.rebalancingThreshold;
    if (inRange) {
      console.log(`BRLA coverage ${coverage.brlaCoverageRatio} in range. No rebalancing needed.`);
      return;
    }
  } else if (forceRestart) {
    console.log("Force restart enabled.");
  }

  const bridgedToday = await getTodayBridgedUsdRaw();
  const dailyLimitRaw = multiplyByPowerOfTen(Big(config.rebalancingDailyBridgeLimitUsd), 6);
  console.log(
    `Bridged $${bridgedToday.div(1e6).toFixed(2)} today. Daily bridge limit is $${config.rebalancingDailyBridgeLimitUsd}.`
  );

  if (coverage && coverage.brlaCoverageRatio < 1 - config.rebalancingThreshold) {
    console.log(`BRLA coverage ${coverage.brlaCoverageRatio} < ${1 - config.rebalancingThreshold}. Running BRLA->USDC.`);
    await runBrlaToUsdc(bridgedToday, dailyLimitRaw);
  } else {
    console.log("Running USDC->BRLA->USDC flow.");
    await runUsdcToBrla(bridgedToday, dailyLimitRaw);
  }
}

const rebalanceFn = useLegacy ? checkForRebalancingLegacy : checkForRebalancing;
console.log(`Using ${useLegacy ? "legacy" : "new"} rebalancing flow.`);

rebalanceFn()
  .then(() => {
    console.log("Rebalancing process completed successfully.");
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
