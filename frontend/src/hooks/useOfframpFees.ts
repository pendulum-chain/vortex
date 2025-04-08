import Big from 'big.js';
import { BaseFiatTokenDetails, OnChainTokenDetails, roundDownToTwoDecimals } from 'shared';
import { useRampDirection } from '../stores/rampDirectionStore';
import { RampDirection } from '../components/RampToggle';

export function calculateOfframpTotalReceive(toAmount: Big, outputToken: BaseFiatTokenDetails): string {
  if (!outputToken || !toAmount) {
    return '0';
  }

  const feeBasisPoints = outputToken.offrampFeesBasisPoints || Big(0);
  const fixedFees = new Big(outputToken.offrampFeesFixedComponent ? outputToken.offrampFeesFixedComponent : 0);
  const fees = toAmount.mul(feeBasisPoints).div(10000).add(fixedFees).round(2, 1);
  const totalReceiveRaw = toAmount.minus(fees);

  if (totalReceiveRaw.gt(0)) {
    return totalReceiveRaw.toFixed(2, 0);
  } else {
    return '0';
  }
}

export function calculateOnrampTotalReceive(toAmount: Big): string {
  if (toAmount && toAmount.gt(0)) {
    return toAmount.toFixed(2, 0);
  }
  return '0';
}

interface OfframpFeesParams {
  toAmount: Big;
  toToken: BaseFiatTokenDetails | OnChainTokenDetails;
}

const calculateTotalReceive = (
  flowType: RampDirection,
  amount: Big,
  token: BaseFiatTokenDetails | OnChainTokenDetails,
) => {
  if (flowType === RampDirection.OFFRAMP) {
    return calculateOfframpTotalReceive(amount, token as BaseFiatTokenDetails);
  } else {
    return calculateOnrampTotalReceive(amount);
  }
};

export const useOfframpFees = ({ toAmount, toToken }: OfframpFeesParams) => {
  const toAmountFixed = roundDownToTwoDecimals(toAmount || Big(0));
  const flowType = useRampDirection();

  const totalReceive = calculateTotalReceive(flowType, toAmount, toToken);

  const totalReceiveFormatted = roundDownToTwoDecimals(Big(totalReceive || 0));
  const feesCost = roundDownToTwoDecimals(Big(toAmountFixed || 0).sub(totalReceive || 0));

  return {
    toAmountFixed,
    totalReceive,
    totalReceiveFormatted,
    feesCost,
  };
};
