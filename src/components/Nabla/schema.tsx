import * as Yup from 'yup';
import { useTranslation } from 'react-i18next';

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

const transformNumber = (value: unknown, originalValue: unknown) => {
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

export const useSchema = () => {
  const { t } = useTranslation();

  return Yup.object<SwapFormValues>().shape({
    from: Yup.string().required(),
    fromAmount: Yup.string().required(),
    to: Yup.string().required(),
    toAmount: Yup.string().required(),
    slippage: Yup.number().nullable().transform(transformNumber),
    deadline: Yup.number().nullable().transform(transformNumber),
    taxId: Yup.string().when('to', {
      is: 'brl',
      then: (schema) =>
        schema.matches(cpfRegex, t('swap.validation.taxId.format')).required(t('swap.validation.taxId.required')),
      otherwise: (schema) => schema.optional(),
    }),
    pixId: Yup.string().when('to', {
      is: 'brl',
      then: (schema) =>
        schema
          .required(t('swap.validation.pixId.required'))
          .test('matches-one', t('swap.validation.pixId.format'), (value) => {
            if (!value) return false;
            return pixKeyRegex.some((regex) => regex.test(value));
          }),
      otherwise: (schema) => schema.optional(),
    }),
  });
};
