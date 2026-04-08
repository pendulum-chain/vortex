import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { isValidCnpj, isValidCpf } from "@vortexfi/shared";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ExtendedAveniaFieldOptions } from "../../../components/Avenia/AveniaField";
import { useTaxId } from "../../../stores/quote/useQuoteFormStore";

const createKybFormSchema = (t: (key: string) => string) =>
  z.object({
    [ExtendedAveniaFieldOptions.TAX_ID]: z
      .string()
      .min(1, t("components.brlaExtendedForm.validation.taxId.required"))
      .refine(value => isValidCpf(value) || isValidCnpj(value), t("components.brlaExtendedForm.validation.taxId.format")),
    [ExtendedAveniaFieldOptions.FULL_NAME]: z.string().min(3, t("components.brlaExtendedForm.validation.fullName.minLength"))
  });

export type KYBFormData = z.infer<ReturnType<typeof createKybFormSchema>>;

export interface UseKYBFormProps {
  initialData?: Partial<KYBFormData>;
}

export const useKYBForm = ({ initialData }: UseKYBFormProps) => {
  const { t } = useTranslation();
  const taxIdFromStore = useTaxId();

  const kybForm = useForm<KYBFormData>({
    defaultValues: {
      [ExtendedAveniaFieldOptions.TAX_ID]: initialData?.taxId || taxIdFromStore || "",
      [ExtendedAveniaFieldOptions.FULL_NAME]: initialData?.fullName || ""
    },
    mode: "onBlur",
    resolver: standardSchemaResolver(createKybFormSchema(t))
  });

  return { kybForm };
};
