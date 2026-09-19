import { multiplyByPowerOfTen } from "@vortexfi/shared";
import Big from "big.js";
import { assertLegacyRebalancerDisabled } from "./cli.ts";
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
import {
  checkInitialUsdcBalanceOnBase,
  compareRoutesUpfront,
  getUsdcBalanceOnBaseRaw
} from "./rebalance/usdc-brla-usdc-base/steps.ts";
import { resumeInFlightRebalance, runRebalanceCycle, shouldQuoteProfitableAmount } from "./rebalanceCycle.ts";
import { getBaseNablaCoverageRatio } from "./services/indexer";
import { BrlaToUsdcBaseStateManager, UsdcBaseStateManager, type WinningRoute } from "./services/stateManager.ts";
import { getConfig } from "./utils/config.ts";

const args = process.argv.slice(2);
const forceRestart = args.includes("--restart");
try {
  assertLegacyRebalancerDisabled(args);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const manualAmount = args.find(arg => !arg.startsWith("--")) || null;
const routeArg = args.find(arg => arg.startsWith("--route="));
const forcedRoute = routeArg ? (routeArg.split("=")[1] as "squidrouter" | "avenia" | "nabla-main") : undefined;
if (forcedRoute && !["squidrouter", "avenia", "nabla-main"].includes(forcedRoute)) {
  console.error("Invalid --route value. Must be 'squidrouter', 'avenia', or 'nabla-main'.");
  process.exit(1);
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
    blindpayShadowQuoteUsdc: string | null;
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
      blindpayShadowQuoteUsdc: comparison.blindpayShadowQuoteUsdc,
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

// Squidrouter's per-address rate limit is tight enough that two route quotes fired back-to-back
// (standard then profitable amount) can trigger "Too many quote requests for this address".
const SQUIDROUTER_QUOTE_STAGGER_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function selectUsdcToBrlaPolicyAmount(coverageDeviationBps: number): Promise<{
  amountUsdcRaw: string;
  policyDecision: Awaited<ReturnType<typeof evaluateUsdcToBrlaPolicy>>;
}> {
  const config = getConfig();
  const standardAmountSelection = selectUsdcToBrlaAmount(
    config.rebalancingUsdToBrlAmount,
    config.rebalancingUsdToBrlAmount,
    false,
    manualAmount
  );
  const standardAmountRaw = toUsdcRaw(standardAmountSelection.amountUsdc);
  const standardPolicyDecision = await evaluateUsdcToBrlaPolicy(standardAmountRaw, coverageDeviationBps);

  if (standardAmountSelection.reason === "manual") {
    return { amountUsdcRaw: standardAmountRaw, policyDecision: standardPolicyDecision };
  }

  const profitableAmountRaw = toUsdcRaw(config.rebalancingProfitableUsdToBrlAmount);
  const quoteProfitableAmount = await shouldQuoteProfitableAmount({
    getBaseUsdcRaw: getUsdcBalanceOnBaseRaw,
    mode: config.rebalancingCostPolicy.mode,
    profitableAmountRaw,
    standardAmountRaw
  });
  if (!quoteProfitableAmount) {
    return { amountUsdcRaw: standardAmountRaw, policyDecision: standardPolicyDecision };
  }

  console.log(
    `Evaluating USDC->BRLA rebalance amounts independently: standard ${standardAmountSelection.amountUsdc} USDC, ` +
      `profitable ${config.rebalancingProfitableUsdToBrlAmount} USDC.`
  );

  await sleep(SQUIDROUTER_QUOTE_STAGGER_MS);
  const profitablePolicyDecision = await evaluateUsdcToBrlaPolicy(profitableAmountRaw, coverageDeviationBps);

  const selectedAmount = selectEvaluatedUsdcToBrlaAmount(
    { amountUsdc: standardAmountSelection.amountUsdc, projectedProfitable: standardPolicyDecision.profitable },
    { amountUsdc: config.rebalancingProfitableUsdToBrlAmount, projectedProfitable: profitablePolicyDecision.profitable },
    null
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
  const selectedAmount = await selectUsdcToBrlaPolicyAmount(coverageDeviationBps);
  const policyDecision = selectedAmount.policyDecision;
  if (!policyDecision.shouldExecute) return;
  await executeUsdcToBrlaRebalance(selectedAmount.amountUsdcRaw, coverageDeviationBps, policyDecision);
}

async function runBrlaToUsdc(coverageDeviationBps: number) {
  const config = getConfig();
  const amountUsdcRaw = toUsdcRaw(manualAmount || config.rebalancingBrlToUsdAmount);

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
}

async function checkForRebalancing() {
  const config = getConfig();

  await runRebalanceCycle({
    lowerBound: 1 - config.rebalancingThresholdBrlaToUsdc,
    readCoverage: getBaseNablaCoverageRatio,
    resumeInFlight: () =>
      resumeInFlightRebalance({
        forceRestart,
        getBrlaToUsdcState: () => new BrlaToUsdcBaseStateManager().getState(),
        getUsdcBaseState: () => new UsdcBaseStateManager().getState(),
        mode: config.rebalancingCostPolicy.mode,
        resumeBrlaToUsdc: () => rebalanceBrlaToUsdcBase(toUsdcRaw(manualAmount || config.rebalancingBrlToUsdAmount), false),
        resumeUsdcBase: () =>
          rebalanceUsdcBrlaUsdcBase(toUsdcRaw(manualAmount || config.rebalancingUsdToBrlAmount), false, forcedRoute)
      }),
    runBrlaToUsdc,
    runUsdcToBrla,
    tryOpportunisticUsdcToBrla,
    upperBound: 1 + config.rebalancingThresholdUsdcToBrla
  });
}

console.log("Using Base rebalancing flow.");

checkForRebalancing()
  .then(() => {
    console.log("Rebalancing process completed successfully.");
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
