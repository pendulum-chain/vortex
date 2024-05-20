import BigNumber from 'bn.js';

export type Percent = number;

/** Calculate share percentage */
export function subtractBigDecimalPercentage(total: BigNumber, percent: number) {
  return total.mul(new BigNumber(1 - percent / 100));
}
