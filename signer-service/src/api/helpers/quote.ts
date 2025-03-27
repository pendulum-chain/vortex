import Big from 'big.js';
import { getAnyFiatTokenDetails, isFiatToken, RampCurrency } from 'shared';

export function calculateTotalReceive(
  toAmount: Big,
  inputCurrency: RampCurrency,
  outputCurrency: RampCurrency,
): string {
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
  // Brla only, for now, has onramp.
  if (isFiatToken(inputCurrency)) {
    const inputTokenDetails = getAnyFiatTokenDetails(inputCurrency);
    const feeBasisPoints = inputTokenDetails.onrampFeesBasisPoints;

    if (feeBasisPoints === undefined) {
      throw new Error('calculateTotalReceive: No onramp fees basis points defined for input token');
    }
    const fixedFees = new Big(
      inputTokenDetails.onrampFeesFixedComponent ? inputTokenDetails.onrampFeesFixedComponent : 0,
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
