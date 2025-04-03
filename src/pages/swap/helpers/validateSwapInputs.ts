import { TokenOutData } from '../../../hooks/nabla/useTokenAmountOut';

type ValidSwapInputs = {
  inputAmountIsStable: true;
  address: string;
  fromAmount: Big;
  tokenOutAmountData: TokenOutData;
};

export const validateSwapInputs = (
  inputAmountIsStable: boolean,
  address: string | undefined,
  fromAmount: Big | undefined,
  tokenOutAmountData: TokenOutData | undefined,
): ValidSwapInputs | false => {
  if (!inputAmountIsStable) return false;
  if (!address) return false;
  if (fromAmount === undefined) {
    console.log('Input amount is undefined');
    return false;
  }
  if (!tokenOutAmountData) {
    console.log('Output amount is undefined');
    return false;
  }

  return { inputAmountIsStable, address, fromAmount, tokenOutAmountData };
};
