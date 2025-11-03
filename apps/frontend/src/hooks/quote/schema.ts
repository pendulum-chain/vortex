import { FiatToken, OnChainToken, RampDirection } from "@vortexfi/shared";
import { useTranslation } from "react-i18next";
import * as Yup from "yup";
import { useRampDirection } from "../../stores/rampDirectionStore";

export type QuoteFormValues = {
  inputAmount: string;
  outputAmount?: string;
  onChainToken: OnChainToken;
  fiatToken: FiatToken;
  slippage?: number;
  deadline?: number;
  pixId?: string;
  taxId?: string;
};

const transformNumber = (value: unknown, originalValue: unknown) => {
  if (!originalValue) return 0;
  if (typeof originalValue === "string" && originalValue !== "") value = Number(originalValue) ?? 0;
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
  /^(([^<>()[\]\\.,;:\s@"]+(.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/, // Email
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ // Random
];

export const createQuoteFormSchema = (
  t: (key: string) => string,
  rampDirection: RampDirection
): Yup.ObjectSchema<QuoteFormValues> => {
  return Yup.object().shape({
    deadline: Yup.number().transform(transformNumber),
    fiatToken: Yup.mixed<FiatToken>().required(t("components.swap.validation.fiatToken.required")),
    inputAmount: Yup.string().required(t("components.swap.validation.inputAmount.required")),
    onChainToken: Yup.mixed<OnChainToken>().required(t("components.swap.validation.onChainToken.required")),
    outputAmount: Yup.string().optional(),
    pixId: Yup.string().when("fiatToken", {
      is: (value: FiatToken) => value === FiatToken.BRL && rampDirection === RampDirection.SELL,
      otherwise: schema => schema.optional(),
      then: schema =>
        schema
          .required(t("components.swap.validation.pixId.required"))
          .test("matches-one", t("components.swap.validation.pixId.format"), value => {
            if (!value) return false;
            return pixKeyRegex.some(regex => regex.test(value));
          })
    }),
    slippage: Yup.number().transform(transformNumber),
    taxId: Yup.string().when("fiatToken", {
      is: (value: FiatToken) => value === FiatToken.BRL,
      otherwise: schema => schema.optional(),
      then: schema =>
        schema
          .required(t("components.swap.validation.taxId.required"))
          .test("matches-one", t("components.swap.validation.taxId.format"), value => {
            if (!value) return false;
            return isValidCnpj(value) || isValidCpf(value);
          })
    })
  });
};

export const useSchema = () => {
  const { t } = useTranslation();
  const rampDirection = useRampDirection();

  return createQuoteFormSchema(t, rampDirection);
};
