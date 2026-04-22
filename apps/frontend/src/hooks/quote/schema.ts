import { FiatToken, OnChainTokenSymbol, RampDirection } from "@vortexfi/shared";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useRampDirection } from "../../stores/rampDirectionStore";

export type QuoteFormValues = {
  inputAmount: string;
  outputAmount?: string;
  onChainToken: OnChainTokenSymbol;
  fiatToken: FiatToken;
  slippage?: number;
  deadline?: number;
  pixId?: string;
  taxId?: string;
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

export const createQuoteFormSchema = (t: (key: string) => string, rampDirection: RampDirection) => {
  return z
    .object({
      deadline: z.number().optional(),
      fiatToken: z.string() as z.ZodType<FiatToken>,
      inputAmount: z.string().min(1, t("components.swap.validation.inputAmount.required")),
      onChainToken: z.string() as z.ZodType<OnChainTokenSymbol>,
      outputAmount: z.string().optional(),
      pixId: z.string().optional(),
      slippage: z.number().optional(),
      taxId: z.string().optional()
    })
    .superRefine((data, ctx) => {
      if (data.fiatToken === FiatToken.BRL && rampDirection === RampDirection.SELL) {
        const { pixId } = data;
        if (!pixId) {
          ctx.addIssue({
            code: "custom",
            message: t("components.swap.validation.pixId.required"),
            path: ["pixId"]
          });
        } else if (!pixKeyRegex.some(regex => regex.test(pixId))) {
          ctx.addIssue({ code: "custom", message: t("components.swap.validation.pixId.format"), path: ["pixId"] });
        }
      }
      if (data.fiatToken === FiatToken.BRL) {
        const { taxId } = data;
        if (!taxId) {
          ctx.addIssue({
            code: "custom",
            message: t("components.swap.validation.taxId.required"),
            path: ["taxId"]
          });
        } else if (!isValidCnpj(taxId) && !isValidCpf(taxId)) {
          ctx.addIssue({ code: "custom", message: t("components.swap.validation.taxId.format"), path: ["taxId"] });
        }
      }
    });
};

export const useSchema = () => {
  const { t } = useTranslation();
  const rampDirection = useRampDirection();

  return createQuoteFormSchema(t, rampDirection);
};
