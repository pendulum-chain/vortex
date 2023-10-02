import { roundNumber } from '../shared/parseNumbers';

export type Percent = number;

const PRECISION = 10000;
/** Calculate fiat value price impact */
export function calcFiatValuePriceImpact(
  fiatInput: number | undefined | null,
  fiatOutput: number | undefined | null,
): number | undefined {
  if (!fiatOutput || !fiatInput) return undefined;
  const ratio = 1 - fiatOutput / fiatInput;
  return Math.floor(ratio * PRECISION);
}

/** Calculate percentage */
export const calcPercentage = (value = 0, percent = 0, round = 2) => roundNumber(value * (1 - percent / 100), round);

/** Calculate share percentage */
export const calcSharePercentage = (total = 0, share = 0, round = 2) => roundNumber((share / total) * 100, round) || 0;

export const min = (val: number, minNumber = 0) => Math.max(val, minNumber);
export const max = (val: number, maxNumber = 100) => Math.min(val, maxNumber);
export const minMax = (val: number, minNumber = 0, maxNumber = 100) => max(min(val, minNumber), maxNumber);

/** Calculate pool APY (daily fee * 365 / TVL)  */
export const calcAPR = (dailyFees: number, tvl: number, round = 2) =>
  roundNumber(((dailyFees * 365) / tvl) * 100, round);
