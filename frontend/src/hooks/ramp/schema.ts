import * as Yup from 'yup';
import { useTranslation } from 'react-i18next';

import { OnChainToken, FiatToken } from 'shared';
import { RampDirection } from '../../components/RampToggle';
import { useRampDirection } from '../../stores/rampDirectionStore';

export type RampFormValues = {
  inputAmount: string;
  outputAmount?: string;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  slippage?: number;
  deadline?: number;
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
  /^\+[1-9][0-9]\d{1,14}$/, // Phone
  /^(([^<>()[\]\\.,;:\s@"]+(.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/, // Email
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, // Random
];

export const createRampFormSchema = (t: (key: string) => string, rampDirection: RampDirection) => {
  return Yup.object<RampFormValues>().shape({
    inputAmount: Yup.string().required(t('components.swap.validation.inputAmount.required')),
    outputAmount: Yup.string().optional(),
    onChainToken: Yup.mixed<OnChainToken>().required(t('components.swap.validation.onChainToken.required')),
    fiatToken: Yup.mixed<FiatToken>().required(t('components.swap.validation.fiatToken.required')),
    slippage: Yup.number().transform(transformNumber),
    deadline: Yup.number().transform(transformNumber),
    taxId: Yup.string().when('fiatToken', {
      is: (value: FiatToken) => value === FiatToken.BRL,
      then: (schema) =>
        schema
          .required(t('components.swap.validation.taxId.required'))
          .test('matches-one', t('components.swap.validation.taxId.format'), (value) => {
            if (!value) return false;
            return isValidCnpj(value) || isValidCpf(value);
          }),
      otherwise: (schema) => schema.optional(),
    }),
    pixId: Yup.string().when('fiatToken', {
      is: (value: FiatToken) => value === FiatToken.BRL && rampDirection === RampDirection.OFFRAMP,
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

export const useSchema = () => {
  const { t } = useTranslation();
  const rampDirection = useRampDirection();

  return createRampFormSchema(t, rampDirection);
};
