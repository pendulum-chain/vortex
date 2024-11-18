import * as Yup from 'yup';
import { InputTokenType, NetworkType, OutputTokenType } from '../../constants/tokenConfig';

export type SwapFormValues = {
  from: InputTokenType;
  fromAmount: string;
  to: OutputTokenType;
  toAmount: string;
  network: NetworkType;
  slippage: number | undefined;
  deadline: number;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const transformNumber = (value: any, originalValue: any) => {
  if (!originalValue) return 0;
  if (typeof originalValue === 'string' && originalValue !== '') value = Number(originalValue) ?? 0;
  return value;
};

const schema = Yup.object<SwapFormValues>().shape({
  from: Yup.string().required(),
  fromAmount: Yup.string().required(),
  to: Yup.string().required(),
  toAmount: Yup.string().required(),
  network: Yup.string().required(),
  slippage: Yup.number().nullable().transform(transformNumber),
  deadline: Yup.number().nullable().transform(transformNumber),
});

export default schema;
