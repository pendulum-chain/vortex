import { cryptoWaitReady } from "@polkadot/util-crypto";
import { multiplyByPowerOfTen } from "@vortexfi/shared";
import Big from "big.js";
import { rebalanceBrlaToUsdcAxl } from "./rebalance/brla-to-axlusdc";
import { checkInitialPendulumBalance } from "./rebalance/brla-to-axlusdc/steps.ts";
import { rebalanceBrlaToUsdcBase } from "./rebalance/brla-to-usdc-base";
import { quoteBrlaToUsdcBaseRebalance } from "./rebalance/brla-to-usdc-base/steps.ts";
import { rebalanceUsdcBrlaUsdcBase } from "./rebalance/usdc-brla-usdc-base";
import { selectEvaluatedUsdcToBrlaAmount, selectUsdcToBrlaAmount } from "./rebalance/usdc-brla-usdc-base/amountPolicy.ts";
import { evaluatePaidRunDailyLimit, sumTodayBridgedUsdRaw } from "./rebalance/usdc-brla-usdc-base/dailyLimit.ts";
import {
  type DailyBridgeLimitDecision,
  evaluateRebalancingCostPolicy,
  isProjectedProfit,
  type RebalancingCostPolicyDecision,
  shouldTriggerOpportunisticUsdcToBrla
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

  return sumTodayBridgedUsdRaw(usdcHistory, brlaHistory);
}

async function getDailyBridgeLimitContext(): Promise<{ bridgedToday: Big; dailyLimitRaw: Big }> {
  const config = getConfig();
  const bridgedToday = await getTodayBridgedUsdRaw();
  const dailyLimitRaw = multiplyByPowerOfTen(Big(config.rebalancingDailyBridgeLimitUsd), 6);
  console.log(
    `Bridged $${bridgedToday.div(1e6).toFixed(2)} today. Daily bridge limit is $${config.rebalancingDailyBridgeLimitUsd}.`
  );

  return { bridgedToday, dailyLimitRaw };
}

interface CurrentRunDailyLimitEvaluation {
  dailyVolume: {
    bypassedForProfit: boolean;
    limitRaw: string;
    projectedTotalRaw: string;
    usedRaw: string;
  };
  decision?: DailyBridgeLimitDecision;
}

function logDailyLimitDecision(decision: DailyBridgeLimitDecision, dailyLimitUsd: number) {
  if (decision.reason === "under_limit") return;

  const projectedTotalUsd = Big(decision.projectedTotalRaw).div(1e6).toFixed(2);
  console.log(`Daily bridge limit reached: projected $${projectedTotalUsd}, limit $${dailyLimitUsd}. Skipping.`);
}

async function evaluateCurrentRunDailyLimit(
  amountUsdcRaw: string,
  profitable: boolean
): Promise<CurrentRunDailyLimitEvaluation> {
  const config = getConfig();
  const { bridgedToday, dailyLimitRaw } = await getDailyBridgeLimitContext();
  const dailyVolume = {
    bypassedForProfit: profitable,
    limitRaw: dailyLimitRaw.toFixed(0, 0),
    projectedTotalRaw: bridgedToday.plus(Big(amountUsdcRaw)).toFixed(0, 0),
    usedRaw: bridgedToday.toFixed(0, 0)
  };

  if (profitable) {
    console.log(
      `Daily bridge limit bypassed: projected profitable quote for ${Big(amountUsdcRaw).div(1e6).toFixed(6)} USDC. No limit applies.`
    );
    return { dailyVolume };
  }

  const dailyLimitDecision = await evaluatePaidRunDailyLimit(amountUsdcRaw, profitable, async () => ({
    bridgedToday,
    dailyLimitRaw
  }));
  if (!dailyLimitDecision) return { dailyVolume };
  logDailyLimitDecision(dailyLimitDecision, config.rebalancingDailyBridgeLimitUsd);
  return { dailyVolume, decision: dailyLimitDecision };
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
): Promise<{
  decision: RebalancingCostPolicyDecision;
  profitable: boolean;
  routeQuotes?: {
    aveniaQuoteUsdc: string | null;
    mainNablaQuoteUsdc: string | null;
    squidRouterQuoteUsdc: string | null;
  };
  routeSelection?: "forced" | "best-quote";
  shouldExecute: boolean;
  routeToRun?: Exclude<WinningRoute, null>;
}> {
  const config = getConfig();
  if (config.rebalancingCostPolicy.mode === "off") {
    const decision = evaluateRebalancingCostPolicy(
      Big(amountUsdcRaw),
      Big(amountUsdcRaw),
      coverageDeviationBps,
      config.rebalancingCostPolicy
    );
    logCostPolicyDecision("USDC->BRLA->USDC", amountUsdcRaw, amountUsdcRaw, decision);
    return { decision, profitable: false, shouldExecute: false };
  }

  const comparison = await compareRoutesUpfront(amountUsdcRaw);
  const routeToRun = forcedRoute || comparison.winningRoute;
  if (!routeToRun) throw new Error("Route comparison did not select a route.");

  const projectedOutputRaw = getQuoteForRoute(routeToRun, comparison);
  if (!projectedOutputRaw) throw new Error(`Selected route ${routeToRun} did not return a quote.`);

  const decision = evaluateRebalancingCostPolicy(
    Big(amountUsdcRaw),
    Big(projectedOutputRaw),
    coverageDeviationBps,
    config.rebalancingCostPolicy
  );
  logCostPolicyDecision(`USDC->BRLA->USDC via ${routeToRun}`, amountUsdcRaw, projectedOutputRaw, decision);

  return {
    decision,
    profitable: isProjectedProfit(Big(amountUsdcRaw), Big(projectedOutputRaw)),
    routeQuotes: {
      aveniaQuoteUsdc: comparison.aveniaQuoteUsdc,
      mainNablaQuoteUsdc: comparison.mainNablaQuoteUsdc,
      squidRouterQuoteUsdc: comparison.squidRouterQuoteUsdc
    },
    routeSelection: forcedRoute ? "forced" : "best-quote",
    routeToRun,
    shouldExecute: decision.shouldExecute
  };
}

async function executeUsdcToBrlaRebalance(
  amountUsdcRaw: string,
  coverageDeviationBps: number,
  policyDecision: Awaited<ReturnType<typeof evaluateUsdcToBrlaPolicy>>,
  options: { opportunistic?: boolean } = {}
): Promise<boolean> {
  const config = getConfig();
  const dailyLimitEvaluation = await evaluateCurrentRunDailyLimit(amountUsdcRaw, policyDecision.profitable);
  if (dailyLimitEvaluation.decision?.shouldSkip) return false;

  await checkInitialUsdcBalanceOnBase(amountUsdcRaw);
  await rebalanceUsdcBrlaUsdcBase(amountUsdcRaw, forceRestart, policyDecision.routeToRun, {
    config: config.rebalancingCostPolicy,
    dailyLimitDecision: dailyLimitEvaluation.decision,
    dailyVolume: dailyLimitEvaluation.dailyVolume,
    decision: policyDecision.decision,
    deviationBps: coverageDeviationBps,
    fallbackRequiresProfit: policyDecision.profitable,
    opportunistic: options.opportunistic,
    preflightQuotes: policyDecision.routeQuotes,
    routeSelection: policyDecision.routeSelection
  });
  return true;
}

function toUsdcRaw(amountUsdc: string): string {
  return multiplyByPowerOfTen(new Big(amountUsdc), 6).toFixed(0, 0);
}

async function selectUsdcToBrlaPolicyAmount(coverageDeviationBps: number): Promise<{
  amountUsdcRaw: string;
  policyDecision: Awaited<ReturnType<typeof evaluateUsdcToBrlaPolicy>>;
}> {
  const config = getConfig();
  const standardAmountSelection = selectUsdcToBrlaAmount(
    config.rebalancingUsdToBrlAmount,
    config.rebalancingProfitableUsdToBrlAmount,
    false,
    manualAmount
  );
  const standardAmountRaw = toUsdcRaw(standardAmountSelection.amountUsdc);
  const standardPolicyDecision = await evaluateUsdcToBrlaPolicy(standardAmountRaw, coverageDeviationBps);

  if (standardAmountSelection.reason === "manual") {
    return { amountUsdcRaw: standardAmountRaw, policyDecision: standardPolicyDecision };
  }

  const profitableAmountRaw = toUsdcRaw(config.rebalancingProfitableUsdToBrlAmount);
  if (profitableAmountRaw === standardAmountRaw) {
    return { amountUsdcRaw: standardAmountRaw, policyDecision: standardPolicyDecision };
  }

  console.log(
    `Evaluating USDC->BRLA rebalance amounts independently: standard ${standardAmountSelection.amountUsdc} USDC, ` +
      `profitable ${config.rebalancingProfitableUsdToBrlAmount} USDC.`
  );

  const profitablePolicyDecision = await evaluateUsdcToBrlaPolicy(profitableAmountRaw, coverageDeviationBps);

  const selectedAmount = selectEvaluatedUsdcToBrlaAmount(
    { amountUsdc: standardAmountSelection.amountUsdc, projectedProfitable: standardPolicyDecision.profitable },
    { amountUsdc: config.rebalancingProfitableUsdToBrlAmount, projectedProfitable: profitablePolicyDecision.profitable },
    manualAmount
  );

  if (selectedAmount.reason !== "profitable") {
    console.log(
      `Configured profitable amount ${config.rebalancingProfitableUsdToBrlAmount} USDC is not projected profitable. ` +
        `Using standard amount ${standardAmountSelection.amountUsdc} USDC.`
    );
    return { amountUsdcRaw: standardAmountRaw, policyDecision: standardPolicyDecision };
  }

  return { amountUsdcRaw: profitableAmountRaw, policyDecision: profitablePolicyDecision };
}

async function tryOpportunisticUsdcToBrla(): Promise<boolean> {
  const config = getConfig();
  const { amountUsdcRaw, policyDecision } = await selectUsdcToBrlaPolicyAmount(0);
  const opportunisticMaxCostBps = config.rebalancingCostPolicy.opportunisticUsdcToBrlaMaxCostBps;

  if (!policyDecision.shouldExecute) return false;
  if (!shouldTriggerOpportunisticUsdcToBrla(policyDecision.decision.costBps, opportunisticMaxCostBps)) {
    console.log(
      `No opportunistic USDC->BRLA rebalance: projected cost ${policyDecision.decision.costBps} bps >= ${opportunisticMaxCostBps} bps.`
    );
    return false;
  }

  console.log(`Opportunistic USDC->BRLA rebalance triggered at ${policyDecision.decision.costBps} bps projected cost.`);
  return executeUsdcToBrlaRebalance(amountUsdcRaw, 0, policyDecision, { opportunistic: true });
}

async function evaluateBrlaToUsdcPolicy(
  amountUsdcRaw: string,
  coverageDeviationBps: number
): Promise<{ decision: RebalancingCostPolicyDecision; profitable: boolean; shouldExecute: boolean }> {
  const config = getConfig();
  if (config.rebalancingCostPolicy.mode === "off") {
    const decision = evaluateRebalancingCostPolicy(
      Big(amountUsdcRaw),
      Big(amountUsdcRaw),
      coverageDeviationBps,
      config.rebalancingCostPolicy
    );
    logCostPolicyDecision("BRLA->USDC", amountUsdcRaw, amountUsdcRaw, decision);
    return { decision, profitable: false, shouldExecute: false };
  }

  const quote = await quoteBrlaToUsdcBaseRebalance(amountUsdcRaw);
  const decision = evaluateRebalancingCostPolicy(
    Big(amountUsdcRaw),
    Big(quote.projectedUsdcRaw),
    coverageDeviationBps,
    config.rebalancingCostPolicy
  );
  logCostPolicyDecision("BRLA->USDC", amountUsdcRaw, quote.projectedUsdcRaw, decision);

  return {
    decision,
    profitable: isProjectedProfit(Big(amountUsdcRaw), Big(quote.projectedUsdcRaw)),
    shouldExecute: decision.shouldExecute
  };
}

async function runUsdcToBrla(coverageDeviationBps: number) {
  const config = getConfig();
  const amountUsdcRaw = toUsdcRaw(manualAmount || config.rebalancingUsdToBrlAmount);

  const stateManager = new UsdcBaseStateManager();
  const state = await stateManager.getState();
  const isResuming = !forceRestart && state && state.currentPhase !== UsdcBaseRebalancePhase.Idle;

  if (!isResuming) {
    const selectedAmount = await selectUsdcToBrlaPolicyAmount(coverageDeviationBps);
    const policyDecision = selectedAmount.policyDecision;
    if (!policyDecision.shouldExecute) return;
    await executeUsdcToBrlaRebalance(selectedAmount.amountUsdcRaw, coverageDeviationBps, policyDecision);
    return;
  }

  await rebalanceUsdcBrlaUsdcBase(amountUsdcRaw, forceRestart, forcedRoute);
}

async function runBrlaToUsdc(coverageDeviationBps: number) {
  const config = getConfig();
  const amountUsdc = manualAmount || config.rebalancingBrlToUsdAmount;
  const amountUsdcRaw = multiplyByPowerOfTen(new Big(amountUsdc), 6).toFixed(0, 0);

  const stateManager = new BrlaToUsdcBaseStateManager();
  const state = await stateManager.getState();
  const isResuming = !forceRestart && state && state.currentPhase !== BrlaToUsdcBaseRebalancePhase.Idle;

  if (!isResuming) {
    const policyDecision = await evaluateBrlaToUsdcPolicy(amountUsdcRaw, coverageDeviationBps);
    if (!policyDecision.shouldExecute) return;

    const dailyLimitEvaluation = await evaluateCurrentRunDailyLimit(amountUsdcRaw, policyDecision.profitable);
    if (dailyLimitEvaluation.decision?.shouldSkip) return;

    const rebalancerUsdcBalance = await checkInitialUsdcBalanceOnBase(amountUsdcRaw);
    if (config.rebalancingBrlToUsdMinBalance && rebalancerUsdcBalance.lt(config.rebalancingBrlToUsdMinBalance)) {
      throw new Error(
        `Rebalancer USDC balance ${rebalancerUsdcBalance} is below the minimum required balance of ${config.rebalancingBrlToUsdMinBalance} to perform rebalancing.`
      );
    }
    await rebalanceBrlaToUsdcBase(amountUsdcRaw, forceRestart, {
      config: config.rebalancingCostPolicy,
      dailyLimitDecision: dailyLimitEvaluation.decision,
      dailyVolume: dailyLimitEvaluation.dailyVolume,
      decision: policyDecision.decision,
      deviationBps: coverageDeviationBps,
      fallbackRequiresProfit: policyDecision.profitable
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
    if (await tryOpportunisticUsdcToBrla()) return;
    console.log(`BRLA coverage ${coverage.brlaCoverageRatio} in range [${lowerBound}, ${upperBound}]. No rebalancing needed.`);
    return;
  }

  if (coverage.brlaCoverageRatio < lowerBound) {
    const deviationBps = calculateCoverageDeviationBps(coverage.brlaCoverageRatio, lowerBound);
    console.log(
      `BRLA coverage ${coverage.brlaCoverageRatio} < ${lowerBound}. Evaluating BRLA->USDC (${deviationBps} bps deviation).`
    );
    await runBrlaToUsdc(deviationBps);
    return;
  }

  const deviationBps = calculateCoverageDeviationBps(coverage.brlaCoverageRatio, upperBound);
  console.log(
    `BRLA coverage ${coverage.brlaCoverageRatio} > ${upperBound}. Evaluating USDC->BRLA (${deviationBps} bps deviation).`
  );
  await runUsdcToBrla(deviationBps);
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
