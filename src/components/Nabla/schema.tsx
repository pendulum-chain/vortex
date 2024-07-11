import * as Yup from 'yup';

export type SwapFormValues = {
  from: string;
  fromAmount: string;
  to: string;
  toAmount: string;
  slippage: number | undefined;
  deadline: number;
  bankAccount: string;
  taxNumber: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const transformNumber = (value: any, originalValue: any) => {
  if (!originalValue) return 0;
  if (typeof originalValue === 'string' && originalValue !== '') value = Number(originalValue) ?? 0;
  return value;
};

const schema = Yup.object<SwapFormValues>().shape({
  from: Yup.string().min(5).required(),
  fromAmount: Yup.string().required(),
  to: Yup.string().min(5).required(),
  toAmount: Yup.string().required(),
  slippage: Yup.number().nullable().transform(transformNumber),
  deadline: Yup.number().nullable().transform(transformNumber),
  bankAccount: Yup.string().required(),
  taxNumber: Yup.string().required(),
});

export default schema;
