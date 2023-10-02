import { SwapPoolColumn } from '../columns';

export const ModalTypes = {
  AddLiquidity: 2,
  WithdrawLiquidity: 3,
};

export type LiquidityModalProps = {
  data?: SwapPoolColumn;
};
