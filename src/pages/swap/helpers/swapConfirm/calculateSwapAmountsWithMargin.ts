import Big from 'big.js';

import { ContractBalance, multiplyByPowerOfTen } from '../../../../helpers/contracts';
import { InputTokenDetails, BaseOutputTokenDetails } from '../../../../constants/tokenConfig';
import { SPACEWALK_REDEEM_SAFETY_MARGIN } from '../../../../constants/constants';

export const calculateSwapAmountsWithMargin = (
  fromAmount: Big,
  preciseQuotedAmountOut: ContractBalance,
  inputToken: InputTokenDetails,
  outputToken: BaseOutputTokenDetails,
) => {
  // Calculate output amount with margin
  const outputAmountBigMargin = preciseQuotedAmountOut.preciseBigDecimal
    .round(2, 0)
    .mul(1 + SPACEWALK_REDEEM_SAFETY_MARGIN);
  const expectedRedeemAmountRaw = multiplyByPowerOfTen(outputAmountBigMargin, outputToken.decimals).toFixed();

  // Calculate input amount with margin
  const inputAmountBig = Big(fromAmount);
  const inputAmountBigMargin = inputAmountBig.mul(1 + SPACEWALK_REDEEM_SAFETY_MARGIN);
  const inputAmountRaw = multiplyByPowerOfTen(inputAmountBigMargin, inputToken.decimals).toFixed();

  return { expectedRedeemAmountRaw, inputAmountRaw };
};
