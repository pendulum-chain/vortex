import Big from 'big.js';

import { ContractBalance, multiplyByPowerOfTen } from '../../../../helpers/contracts';
import { OnChainTokenDetails, BaseFiatTokenDetails } from '../../../../constants/tokenConfig';
import { SPACEWALK_REDEEM_SAFETY_MARGIN } from '../../../../constants/constants';

export const calculateSwapAmountsWithMargin = (
  fromAmount: Big,
  preciseQuotedAmountOut: ContractBalance,
  onChainToken: OnChainTokenDetails,
  fiatToken: BaseFiatTokenDetails,
) => {
  // Calculate output amount with margin
  const outputAmountBigMargin = preciseQuotedAmountOut.preciseBigDecimal
    .round(2, 0)
    .mul(1 + SPACEWALK_REDEEM_SAFETY_MARGIN);
  // FIXME
  const decimals = 12;
  // const expectedRedeemAmountRaw = multiplyByPowerOfTen(outputAmountBigMargin, fiatToken.decimals).toFixed();
  const expectedRedeemAmountRaw = multiplyByPowerOfTen(outputAmountBigMargin, decimals).toFixed();

  // Calculate input amount with margin
  const inputAmountBig = Big(fromAmount);
  const inputAmountBigMargin = inputAmountBig.mul(1 + SPACEWALK_REDEEM_SAFETY_MARGIN);
  const inputAmountRaw = multiplyByPowerOfTen(inputAmountBigMargin, onChainToken.decimals).toFixed();

  return { expectedRedeemAmountRaw, inputAmountRaw };
};
