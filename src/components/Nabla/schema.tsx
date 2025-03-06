import * as Yup from 'yup';
import { InputTokenType, OutputTokenType } from '../../constants/tokenConfig';

export type SwapFormValues = {
  from: InputTokenType;
  fromAmount: string;
  to: OutputTokenType;
  toAmount: string;
  slippage: number | undefined;
  deadline: number;
  taxId: string | undefined;
  pixId: string | undefined;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const transformNumber = (value: any, originalValue: any) => {
  if (!originalValue) return 0;
  if (typeof originalValue === 'string' && originalValue !== '') value = Number(originalValue) ?? 0;
  return value;
};

const cpfRegex = /^\d{3}(\.\d{3}){2}-\d{2}$|^\d{11}$/;

const schema = Yup.object<SwapFormValues>().shape({
  from: Yup.string().required(),
  fromAmount: Yup.string().required(),
  to: Yup.string().required(),
  toAmount: Yup.string().required(),
  slippage: Yup.number().nullable().transform(transformNumber),
  deadline: Yup.number().nullable().transform(transformNumber),
  taxId: Yup.string().when('to', {
    is: 'brl',
    then: (schema) => schema.matches(cpfRegex).required('Tax ID is required when converting to BRL'),
    otherwise: (schema) => schema.optional(),
  }),
  pixId: Yup.string().when('to', {
    is: 'brl',
    then: (schema) => schema.required('PIX ID is required when converting to BRL'),
    otherwise: (schema) => schema.optional(),
  }),
});

export default schema;
