import Big from 'big.js';
import { getAnyFiatTokenDetails, isFiatToken, RampCurrency } from 'shared';

export function calculateTotalReceive(toAmount: Big, outputCurrency: RampCurrency): string {
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
    }
    return '0';
  }

  throw new Error('calculateTotalReceive: No offramp fees defined for output token');
}

export function calculateTotalReceiveOnramp(fromAmount: Big, inputCurrency: RampCurrency): string {
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
    const fees = fromAmount.mul(feeBasisPoints).div(10000).add(fixedFees).round(2, 1);
    const totalReceiveRaw = fromAmount.minus(fees);

    if (totalReceiveRaw.gt(0)) {
      return totalReceiveRaw.toFixed(2, 0);
    }
    return '0';
  }

  throw new Error('calculateTotalReceiveOnramp: No onramp fees defined for input token');
}
