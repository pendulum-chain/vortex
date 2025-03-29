import Big from 'big.js';
import { calculateOfframpTotalReceive } from '../components/FeeCollapse';
import { BaseFiatTokenDetails, roundDownToTwoDecimals } from 'shared';

export const useOfframpFees = (toAmount: Big, toToken: BaseFiatTokenDetails) => {
  const toAmountFixed = roundDownToTwoDecimals(toAmount);
  const totalReceive = calculateOfframpTotalReceive(toAmount, toToken);
  const totalReceiveFormatted = roundDownToTwoDecimals(Big(totalReceive));
  const feesCost = roundDownToTwoDecimals(Big(toAmountFixed || 0).sub(totalReceive));

  return {
    toAmountFixed,
    totalReceive,
    totalReceiveFormatted,
    feesCost,
  };
};
