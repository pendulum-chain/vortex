import Big from "big.js";

export function wouldExceedDailySwapLimit(swappedTodayRaw: Big, requestedAmountRaw: Big, dailyLimitRaw: Big): boolean {
  return swappedTodayRaw.plus(requestedAmountRaw).gt(dailyLimitRaw);
}
