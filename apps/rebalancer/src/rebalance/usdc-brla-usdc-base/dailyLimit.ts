import Big from "big.js";
import type { RebalanceHistoryEntry } from "../../services/stateManager.ts";

export function sumTodayBridgedUsdRaw(
  usdcHistory: RebalanceHistoryEntry[],
  brlaHistory: RebalanceHistoryEntry[],
  now = new Date()
): Big {
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  return [...usdcHistory, ...brlaHistory]
    .filter(e => new Date(e.startingTime) >= todayStart)
    .reduce((sum, e) => sum.plus(Big(e.initialAmount)), Big(0));
}
