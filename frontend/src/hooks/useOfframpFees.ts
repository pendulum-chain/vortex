import Big from 'big.js';
import { calculateOfframpTotalReceive, calculateOnrampTotalReceive } from '../components/FeeCollapse';
import { BaseFiatTokenDetails, OnChainTokenDetails, roundDownToTwoDecimals } from 'shared';
import { useRampDirection } from '../stores/rampDirectionStore';
import { RampDirection } from '../components/RampToggle';

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
