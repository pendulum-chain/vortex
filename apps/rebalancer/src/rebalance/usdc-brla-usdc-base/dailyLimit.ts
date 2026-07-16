import Big from "big.js";
import type { RebalanceHistoryEntry } from "../../services/stateManager.ts";
import { type DailyBridgeLimitDecision, evaluateDailyBridgeLimit } from "./guards.ts";

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

export async function evaluatePaidRunDailyLimit(
  amountUsdcRaw: string,
  profitable: boolean,
  getDailyBridgeLimitContext: () => Promise<{ bridgedToday: Big; dailyLimitRaw: Big }>
): Promise<DailyBridgeLimitDecision | undefined> {
  if (profitable) return undefined;

  const { bridgedToday, dailyLimitRaw } = await getDailyBridgeLimitContext();
  return evaluateDailyBridgeLimit(bridgedToday, Big(amountUsdcRaw), dailyLimitRaw);
}
