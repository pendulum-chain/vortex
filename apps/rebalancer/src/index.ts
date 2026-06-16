import { cryptoWaitReady } from "@polkadot/util-crypto";
import { multiplyByPowerOfTen } from "@vortexfi/shared";
import Big from "big.js";
import { rebalanceBrlaToUsdcAxl } from "./rebalance/brla-to-axlusdc";
import { checkInitialPendulumBalance } from "./rebalance/brla-to-axlusdc/steps.ts";
import { rebalanceBrlaToUsdcBase } from "./rebalance/brla-to-usdc-base";
import { quoteBrlaToUsdcBaseRebalance } from "./rebalance/brla-to-usdc-base/steps.ts";
import { rebalanceUsdcBrlaUsdcBase } from "./rebalance/usdc-brla-usdc-base";
import {
  evaluateRebalancingCostPolicy,
  type RebalancingCostPolicyDecision,
  wouldExceedDailyBridgeLimit
} from "./rebalance/usdc-brla-usdc-base/guards.ts";
import { checkInitialUsdcBalanceOnBase, compareRoutesUpfront } from "./rebalance/usdc-brla-usdc-base/steps.ts";
import { getBaseNablaCoverageRatio, getSwapPoolsWithCoverageRatio } from "./services/indexer";
import {
  BrlaToAxlUsdcStateManager,
  BrlaToUsdcBaseRebalancePhase,
  BrlaToUsdcBaseStateManager,
  RebalancePhase,
  UsdcBaseRebalancePhase,
  UsdcBaseStateManager,
  type WinningRoute
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

function calculateCoverageDeviationBps(coverageRatio: number, triggerBound: number): number {
  return Number(
    Big(Math.abs(coverageRatio - triggerBound))
      .mul(10_000)
      .toFixed(2)
  );
}

function getQuoteForRoute(
  route: Exclude<WinningRoute, null>,
  quotes: {
    squidRouterQuoteUsdc: string | null;
    aveniaQuoteUsdc: string | null;
    mainNablaQuoteUsdc: string | null;
  }
): string | null {
  if (route === "squidrouter") return quotes.squidRouterQuoteUsdc;
  if (route === "avenia") return quotes.aveniaQuoteUsdc;
  return quotes.mainNablaQuoteUsdc;
}

function logCostPolicyDecision(
  direction: string,
  inputAmountRaw: string,
  projectedOutputRaw: string,
  decision: RebalancingCostPolicyDecision
) {
  const inputUsdc = Big(inputAmountRaw).div(1e6).toFixed(6);
  const projectedUsdc = Big(projectedOutputRaw).div(1e6).toFixed(6);
  const projectedCostUsdc = Big(decision.projectedCostRaw).div(1e6).toFixed(6);
  console.log(
    [
      `Rebalancing cost policy (${direction}): ${decision.shouldExecute ? "execute" : "skip"}`,
      `band=${decision.band}`,
      `cost=${decision.costBps}bps`,
      `allowed=${decision.allowedCostBps}bps`,
      `input=${inputUsdc} USDC`,
      `projectedOutput=${projectedUsdc} USDC`,
      `projectedCost=${projectedCostUsdc} USDC`,
      `reason=${decision.reason}`
    ].join(" | ")
  );
}

async function evaluateUsdcToBrlaPolicy(
  amountUsdcRaw: string,
  coverageDeviationBps: number
): Promise<{ decision: RebalancingCostPolicyDecision; shouldExecute: boolean; routeToRun?: Exclude<WinningRoute, null> }> {
  const config = getConfig();
  if (config.rebalancingCostPolicy.mode === "off") {
    const decision = evaluateRebalancingCostPolicy(
      Big(amountUsdcRaw),
      Big(amountUsdcRaw),
      coverageDeviationBps,
      config.rebalancingCostPolicy
    );
    logCostPolicyDecision("USDC->BRLA->USDC", amountUsdcRaw, amountUsdcRaw, decision);
    return { decision, shouldExecute: false };
  }

  const comparison = await compareRoutesUpfront(amountUsdcRaw);
  const routeToRun = forcedRoute || comparison.winningRoute;
  if (!routeToRun) throw new Error("Route comparison did not select a route.");

  const projectedOutputRaw = getQuoteForRoute(routeToRun, comparison);
  if (!projectedOutputRaw) throw new Error(`Forced route ${routeToRun} did not return a quote.`);

  const decision = evaluateRebalancingCostPolicy(
    Big(amountUsdcRaw),
    Big(projectedOutputRaw),
    coverageDeviationBps,
    config.rebalancingCostPolicy
  );
  logCostPolicyDecision(`USDC->BRLA->USDC via ${routeToRun}`, amountUsdcRaw, projectedOutputRaw, decision);

  return { decision, routeToRun, shouldExecute: decision.shouldExecute };
}

async function evaluateBrlaToUsdcPolicy(
  amountUsdcRaw: string,
  coverageDeviationBps: number
): Promise<{ decision: RebalancingCostPolicyDecision; shouldExecute: boolean }> {
  const config = getConfig();
  if (config.rebalancingCostPolicy.mode === "off") {
    const decision = evaluateRebalancingCostPolicy(
      Big(amountUsdcRaw),
      Big(amountUsdcRaw),
      coverageDeviationBps,
      config.rebalancingCostPolicy
    );
    logCostPolicyDecision("BRLA->USDC", amountUsdcRaw, amountUsdcRaw, decision);
    return { decision, shouldExecute: false };
  }

  const quote = await quoteBrlaToUsdcBaseRebalance(amountUsdcRaw);
  const decision = evaluateRebalancingCostPolicy(
    Big(amountUsdcRaw),
    Big(quote.projectedUsdcRaw),
    coverageDeviationBps,
    config.rebalancingCostPolicy
  );
  logCostPolicyDecision("BRLA->USDC", amountUsdcRaw, quote.projectedUsdcRaw, decision);

  return { decision, shouldExecute: decision.shouldExecute };
}

async function runUsdcToBrla(bridgedToday: Big, dailyLimitRaw: Big, coverageDeviationBps: number) {
  const config = getConfig();
  const amountUsdc = manualAmount || config.rebalancingUsdToBrlAmount;
  const amountUsdcRaw = multiplyByPowerOfTen(new Big(amountUsdc), 6).toFixed(0, 0);

  const stateManager = new UsdcBaseStateManager();
  const state = await stateManager.getState();
  const isResuming = !forceRestart && state && state.currentPhase !== UsdcBaseRebalancePhase.Idle;

  if (!isResuming) {
    if (checkDailyLimit(bridgedToday, Big(amountUsdcRaw), dailyLimitRaw, config.rebalancingDailyBridgeLimitUsd)) return;
    const policyDecision = await evaluateUsdcToBrlaPolicy(amountUsdcRaw, coverageDeviationBps);
    if (!policyDecision.shouldExecute) return;
    await checkInitialUsdcBalanceOnBase(amountUsdcRaw);
    await rebalanceUsdcBrlaUsdcBase(amountUsdcRaw, forceRestart, policyDecision.routeToRun, {
      config: config.rebalancingCostPolicy,
      decision: policyDecision.decision,
      deviationBps: coverageDeviationBps
    });
    return;
  }

  await rebalanceUsdcBrlaUsdcBase(amountUsdcRaw, forceRestart, forcedRoute);
}

async function runBrlaToUsdc(bridgedToday: Big, dailyLimitRaw: Big, coverageDeviationBps: number) {
  const config = getConfig();
  const amountUsdc = manualAmount || config.rebalancingBrlToUsdAmount;
  const amountUsdcRaw = multiplyByPowerOfTen(new Big(amountUsdc), 6).toFixed(0, 0);

  const stateManager = new BrlaToUsdcBaseStateManager();
  const state = await stateManager.getState();
  const isResuming = !forceRestart && state && state.currentPhase !== BrlaToUsdcBaseRebalancePhase.Idle;

  if (!isResuming) {
    if (checkDailyLimit(bridgedToday, Big(amountUsdcRaw), dailyLimitRaw, config.rebalancingDailyBridgeLimitUsd)) return;
    const policyDecision = await evaluateBrlaToUsdcPolicy(amountUsdcRaw, coverageDeviationBps);
    if (!policyDecision.shouldExecute) return;

    const rebalancerUsdcBalance = await checkInitialUsdcBalanceOnBase(amountUsdcRaw);
    if (config.rebalancingBrlToUsdMinBalance && rebalancerUsdcBalance.lt(config.rebalancingBrlToUsdMinBalance)) {
      throw new Error(
        `Rebalancer USDC balance ${rebalancerUsdcBalance} is below the minimum required balance of ${config.rebalancingBrlToUsdMinBalance} to perform rebalancing.`
      );
    }
    await rebalanceBrlaToUsdcBase(amountUsdcRaw, forceRestart, {
      config: config.rebalancingCostPolicy,
      decision: policyDecision.decision,
      deviationBps: coverageDeviationBps
    });
    return;
  }

  await rebalanceBrlaToUsdcBase(amountUsdcRaw, forceRestart);
}

async function checkForRebalancing() {
  const config = getConfig();
  const coverage = await getBaseNablaCoverageRatio();

  if (!coverage) throw new Error("Failed to fetch Base Nabla coverage ratio.");

  const lowerBound = 1 - config.rebalancingThresholdBrlaToUsdc;
  const upperBound = 1 + config.rebalancingThresholdUsdcToBrla;

  if (coverage.brlaCoverageRatio >= lowerBound && coverage.brlaCoverageRatio <= upperBound) {
    console.log(`BRLA coverage ${coverage.brlaCoverageRatio} in range [${lowerBound}, ${upperBound}]. No rebalancing needed.`);
    return;
  }

  const bridgedToday = await getTodayBridgedUsdRaw();
  const dailyLimitRaw = multiplyByPowerOfTen(Big(config.rebalancingDailyBridgeLimitUsd), 6);
  console.log(
    `Bridged $${bridgedToday.div(1e6).toFixed(2)} today. Daily bridge limit is $${config.rebalancingDailyBridgeLimitUsd}.`
  );

  if (coverage.brlaCoverageRatio < lowerBound) {
    const deviationBps = calculateCoverageDeviationBps(coverage.brlaCoverageRatio, lowerBound);
    console.log(
      `BRLA coverage ${coverage.brlaCoverageRatio} < ${lowerBound}. Evaluating BRLA->USDC (${deviationBps} bps deviation).`
    );
    await runBrlaToUsdc(bridgedToday, dailyLimitRaw, deviationBps);
    return;
  }

  const deviationBps = calculateCoverageDeviationBps(coverage.brlaCoverageRatio, upperBound);
  console.log(
    `BRLA coverage ${coverage.brlaCoverageRatio} > ${upperBound}. Evaluating USDC->BRLA (${deviationBps} bps deviation).`
  );
  await runUsdcToBrla(bridgedToday, dailyLimitRaw, deviationBps);
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
