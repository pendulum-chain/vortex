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

// Regex adopted from here https://developers.international.pagseguro.com/reference/pix-key-validation-and-regex-1
const pixKeyRegex = [
  cpfRegex,
  /^[0-9]{14}$/, // CNPJ
  /^\+[1-9][0-9]\d{1,14}$/, // Phone
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/, // Email
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, // Random
];

const schema = Yup.object<SwapFormValues>().shape({
  from: Yup.string().required(),
  fromAmount: Yup.string().required(),
  to: Yup.string().required(),
  toAmount: Yup.string().required(),
  slippage: Yup.number().nullable().transform(transformNumber),
  deadline: Yup.number().nullable().transform(transformNumber),
  taxId: Yup.string().when('to', {
    is: 'brl',
    then: (schema) => schema.matches(cpfRegex, 'Invalid CPF').required('CPF is required when transferring BRL'),
    otherwise: (schema) => schema.optional(),
  }),
  pixId: Yup.string().when('to', {
    is: 'brl',
    then: (schema) =>
      schema
        .required('PIX key is required when transferring BRL')
        .test('matches-one', 'PIX key does not match any of the valid formats', (value) => {
          if (!value) return false;
          return pixKeyRegex.some((regex) => regex.test(value));
        }),
    otherwise: (schema) => schema.optional(),
  }),
});

export default schema;
