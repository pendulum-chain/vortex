export type SwapFormValues = {
  from: string;
  fromAmount: number;
  to: string;
  toAmount: number;
  slippage: number | undefined;
  deadline: number;
};
