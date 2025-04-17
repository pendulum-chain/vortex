import * as Yup from 'yup';
import { useTranslation } from 'react-i18next';

import { OnChainToken, FiatToken } from 'shared';

export type RampFormValues = {
  inputAmount: string;
  outputAmount?: string;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  slippage: number | undefined;
  deadline: number;
  taxId?: string;
  pixId?: string;
};

const transformNumber = (value: unknown, originalValue: unknown) => {
  if (!originalValue) return 0;
  if (typeof originalValue === 'string' && originalValue !== '') value = Number(originalValue) ?? 0;
  return value;
};

const cpfRegex = /^\d{3}(\.\d{3}){2}-\d{2}$|^\d{11}$/;
const cnpjRegex = /^(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})$/;

export function isValidCnpj(cnpj: string): boolean {
  return cnpjRegex.test(cnpj);
}

export function isValidCpf(cpf: string): boolean {
  return cpfRegex.test(cpf);
}

// Regex adopted from here https://developers.international.pagseguro.com/reference/pix-key-validation-and-regex-1
const pixKeyRegex = [
  cpfRegex,
  cnpjRegex,
  /^\+[1-9][0-9]\d{1,14}$/, // Phone
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/, // Email
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, // Random
];

export const useSchema = () => {
  const { t } = useTranslation();

  return Yup.object<RampFormValues>().shape({
    from: Yup.string().required(),
    fromAmount: Yup.string().required(),
    to: Yup.string().required(),
    toAmount: Yup.string().required(),
    slippage: Yup.number().nullable().transform(transformNumber),
    deadline: Yup.number().nullable().transform(transformNumber),
    taxId: Yup.string().when('to', {
      is: 'brl',
      then: (schema) =>
        schema
          .matches(cpfRegex, t('components.swap.validation.taxId.format'))
          .required(t('components.swap.validation.taxId.required')),
      otherwise: (schema) => schema.optional(),
    }),
    pixId: Yup.string().when('to', {
      is: 'brl',
      then: (schema) =>
        schema
          .required(t('components.swap.validation.pixId.required'))
          .test('matches-one', t('components.swap.validation.pixId.format'), (value) => {
            if (!value) return false;
            return pixKeyRegex.some((regex) => regex.test(value));
          }),
      otherwise: (schema) => schema.optional(),
    }),
  });
};
