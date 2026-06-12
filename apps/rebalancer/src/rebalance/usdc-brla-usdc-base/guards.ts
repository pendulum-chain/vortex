import Big from "big.js";

export const DEFAULT_ARRIVAL_TOLERANCE = "0.998";

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
