import { FiatToken, OnChainToken, RampDirection } from "@packages/shared";
import { useTranslation } from "react-i18next";
import * as Yup from "yup";
import { useRampDirection } from "../../stores/rampDirectionStore";

export type RampFormValues = {
  taxId?: string;
  pixId?: string;
  walletAddress?: string;
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

export const createRampFormSchema = (t: (key: string) => string, rampDirection: RampDirection) => {
  return Yup.object<RampFormValues>().shape({
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
    }),
    walletAddress: Yup.string()
  });
};

export const useSchema = () => {
  const { t } = useTranslation();
  const rampDirection = useRampDirection();

  return createRampFormSchema(t, rampDirection);
};
