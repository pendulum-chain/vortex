import { yupResolver } from "@hookform/resolvers/yup";
import { isValidCnpj, isValidCpf } from "@vortexfi/shared";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as yup from "yup";
import { ExtendedAveniaFieldOptions } from "../../../components/Avenia/AveniaField";
import { useTaxId } from "../../../stores/quote/useQuoteFormStore";

const createKybFormSchema = (t: (key: string) => string) =>
  yup
    .object({
      [ExtendedAveniaFieldOptions.TAX_ID]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.taxId.required"))
        .test("is-valid-tax-id", t("components.brlaExtendedForm.validation.taxId.format"), value => {
          if (!value) return false;
          return isValidCpf(value) || isValidCnpj(value);
        }),
      [ExtendedAveniaFieldOptions.FULL_NAME]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.fullName.required"))
        .min(3, t("components.brlaExtendedForm.validation.fullName.minLength"))
    })
    .required();

export type KYBFormData = yup.InferType<ReturnType<typeof createKybFormSchema>>;

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
    resolver: yupResolver(createKybFormSchema(t))
  });

  return { kybForm };
};
