import Big from 'big.js';
import { getAnyFiatTokenDetails, isFiatToken } from '../../config/tokens';

export function calculateTotalReceive(toAmount: Big, outputCurrency: string): string {
  if (isFiatToken(outputCurrency)) {
    const outputTokenDetails = getAnyFiatTokenDetails(outputCurrency);
    const feeBasisPoints = outputTokenDetails.offrampFeesBasisPoints;
    const fixedFees = new Big(
      outputTokenDetails.offrampFeesFixedComponent ? outputTokenDetails.offrampFeesFixedComponent : 0,
    );
    const fees = toAmount.mul(feeBasisPoints).div(10000).add(fixedFees).round(2, 1);
    const totalReceiveRaw = toAmount.minus(fees);

    if (totalReceiveRaw.gt(0)) {
      return totalReceiveRaw.toFixed(2, 0);
    } else {
      return '0';
    }
  }

  return toAmount.toFixed(2, 0);
}
