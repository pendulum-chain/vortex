import Big from "big.js";

export const DEFAULT_ARRIVAL_TOLERANCE = "0.998";

export type RebalancingPolicyMode = "auto" | "always" | "dry-run" | "off";
export type RebalancingUrgencyBand = "mild" | "moderate" | "severe";

export interface RebalancingCostPolicyConfig {
  hardMaxCostBps: number;
  maxCostBpsMild: number;
  maxCostBpsModerate: number;
  maxCostBpsSevere: number;
  mode: RebalancingPolicyMode;
  moderateDeviationBps: number;
  severeDeviationBps: number;
}

export interface RebalancingCostPolicyDecision {
  allowedCostBps: number;
  band: RebalancingUrgencyBand;
  costBps: number;
  dryRun: boolean;
  projectedCostRaw: string;
  reason: string;
  shouldExecute: boolean;
}

export interface DailyBridgeLimitDecision {
  projectedTotalRaw: string;
  reason: "under_limit" | "profitable_quote" | "daily_limit_reached";
  shouldSkip: boolean;
}

export function calculateMinimumDelta(expectedDelta: Big, tolerance = DEFAULT_ARRIVAL_TOLERANCE): Big {
  return expectedDelta.mul(tolerance);
}

export function calculateTargetBalanceRaw(startingBalanceRaw: string, expectedDeltaRaw: string, tolerance = "1"): string {
  return Big(startingBalanceRaw)
    .plus(calculateMinimumDelta(Big(expectedDeltaRaw), tolerance))
    .toFixed(0, 0);
}

export function wouldExceedDailyBridgeLimit(bridgedTodayRaw: Big, requestedAmountRaw: Big, dailyLimitRaw: Big): boolean {
  return bridgedTodayRaw.plus(requestedAmountRaw).gt(dailyLimitRaw);
}

export function isProjectedProfit(inputAmountRaw: Big, projectedOutputRaw: Big): boolean {
  return projectedOutputRaw.gt(inputAmountRaw);
}

export function evaluateDailyBridgeLimit(
  bridgedTodayRaw: Big,
  requestedAmountRaw: Big,
  dailyLimitRaw: Big,
  profitable: boolean
): DailyBridgeLimitDecision {
  const projectedTotalRaw = bridgedTodayRaw.plus(requestedAmountRaw).toFixed(0, 0);

  if (!wouldExceedDailyBridgeLimit(bridgedTodayRaw, requestedAmountRaw, dailyLimitRaw)) {
    return { projectedTotalRaw, reason: "under_limit", shouldSkip: false };
  }

  if (profitable) {
    return { projectedTotalRaw, reason: "profitable_quote", shouldSkip: false };
  }

  return { projectedTotalRaw, reason: "daily_limit_reached", shouldSkip: true };
}

export function calculateProjectedCostBps(inputAmountRaw: Big, projectedOutputRaw: Big): number {
  if (inputAmountRaw.lte(0)) throw new Error("inputAmountRaw must be greater than zero.");
  return Number(inputAmountRaw.minus(projectedOutputRaw).div(inputAmountRaw).mul(10_000).toFixed(2));
}

export function getRebalancingUrgencyBand(
  deviationBps: number,
  config: Pick<RebalancingCostPolicyConfig, "moderateDeviationBps" | "severeDeviationBps">
): RebalancingUrgencyBand {
  if (deviationBps >= config.severeDeviationBps) return "severe";
  if (deviationBps >= config.moderateDeviationBps) return "moderate";
  return "mild";
}

export function evaluateRebalancingCostPolicy(
  inputAmountRaw: Big,
  projectedOutputRaw: Big,
  deviationBps: number,
  config: RebalancingCostPolicyConfig
): RebalancingCostPolicyDecision {
  const band = getRebalancingUrgencyBand(deviationBps, config);
  const projectedCostRaw = inputAmountRaw.minus(projectedOutputRaw);
  const costBps = calculateProjectedCostBps(inputAmountRaw, projectedOutputRaw);
  const allowedCostBps = {
    mild: config.maxCostBpsMild,
    moderate: config.maxCostBpsModerate,
    severe: config.maxCostBpsSevere
  }[band];

  if (config.mode === "off") {
    return {
      allowedCostBps,
      band,
      costBps,
      dryRun: false,
      projectedCostRaw: projectedCostRaw.toFixed(0, 0),
      reason: "Rebalancing policy mode is off.",
      shouldExecute: false
    };
  }

  if (costBps > config.hardMaxCostBps) {
    return {
      allowedCostBps,
      band,
      costBps,
      dryRun: config.mode === "dry-run",
      projectedCostRaw: projectedCostRaw.toFixed(0, 0),
      reason: `Projected cost ${costBps} bps exceeds hard cap ${config.hardMaxCostBps} bps.`,
      shouldExecute: false
    };
  }

  if (config.mode === "dry-run") {
    return {
      allowedCostBps,
      band,
      costBps,
      dryRun: true,
      projectedCostRaw: projectedCostRaw.toFixed(0, 0),
      reason: `Dry-run: would ${costBps <= allowedCostBps ? "execute" : "skip"} ${band} rebalance at ${costBps} bps cost.`,
      shouldExecute: false
    };
  }

  if (config.mode === "always") {
    return {
      allowedCostBps,
      band,
      costBps,
      dryRun: false,
      projectedCostRaw: projectedCostRaw.toFixed(0, 0),
      reason: `Always mode permits ${band} rebalance at ${costBps} bps cost.`,
      shouldExecute: true
    };
  }

  if (costBps > allowedCostBps) {
    return {
      allowedCostBps,
      band,
      costBps,
      dryRun: false,
      projectedCostRaw: projectedCostRaw.toFixed(0, 0),
      reason: `Projected cost ${costBps} bps exceeds ${band} limit ${allowedCostBps} bps.`,
      shouldExecute: false
    };
  }

  return {
    allowedCostBps,
    band,
    costBps,
    dryRun: false,
    projectedCostRaw: projectedCostRaw.toFixed(0, 0),
    reason: `Projected cost ${costBps} bps is within ${band} limit ${allowedCostBps} bps.`,
    shouldExecute: true
  };
}
