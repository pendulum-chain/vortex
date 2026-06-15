import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { isValidCnpj, isValidCpf } from "@vortexfi/shared";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ExtendedAveniaFieldOptions } from "../../../components/Avenia/AveniaField";
import { useTaxId } from "../../../stores/quote/useQuoteFormStore";

const createKybFormSchema = (t: (key: string) => string, requireCnpj: boolean) =>
  z.object({
    [ExtendedAveniaFieldOptions.TAX_ID]: z
      .string()
      .min(1, t("components.brlaExtendedForm.validation.taxId.required"))
      .refine(
        value => (requireCnpj ? isValidCnpj(value) : isValidCpf(value) || isValidCnpj(value)),
        t(`components.brlaExtendedForm.validation.taxId.${requireCnpj ? "cnpjFormat" : "format"}`)
      ),
    [ExtendedAveniaFieldOptions.FULL_NAME]: z.string().min(3, t("components.brlaExtendedForm.validation.fullName.minLength"))
  });

export type KYBFormData = z.infer<ReturnType<typeof createKybFormSchema>>;

export interface UseKYBFormProps {
  initialData?: Partial<KYBFormData>;
  // KYB is business-only; the quote-less deep link lets the user type the tax ID, so restrict it to CNPJ.
  requireCnpj?: boolean;
}

export const useKYBForm = ({ initialData, requireCnpj = false }: UseKYBFormProps) => {
  const { t } = useTranslation();
  const taxIdFromStore = useTaxId();

  const kybForm = useForm<KYBFormData>({
    defaultValues: {
      [ExtendedAveniaFieldOptions.TAX_ID]: initialData?.taxId || taxIdFromStore || "",
      [ExtendedAveniaFieldOptions.FULL_NAME]: initialData?.fullName || ""
    },
    mode: "onBlur",
    resolver: standardSchemaResolver(createKybFormSchema(t, requireCnpj))
  });

  return { kybForm };
};
