import Big from 'big.js';
import { calculateTotalReceive } from '../components/FeeCollapse';
import { roundDownToTwoDecimals } from '../helpers/parseNumbers';
import { OutputTokenDetails } from '../constants/tokenConfig';

export const useOfframpFees = (toAmount: Big, toToken: OutputTokenDetails) => {
  const toAmountFixed = roundDownToTwoDecimals(toAmount);
  const totalReceive = calculateTotalReceive(toAmount, toToken);
  const totalReceiveFormatted = roundDownToTwoDecimals(Big(totalReceive));
  const feesCost = roundDownToTwoDecimals(Big(toAmountFixed || 0).sub(totalReceive));

  return {
    toAmountFixed,
    totalReceive,
    totalReceiveFormatted,
    feesCost,
  };
};
