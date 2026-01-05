import { yupResolver } from "@hookform/resolvers/yup";
import { isValidCnpj, isValidCpf } from "@vortexfi/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as yup from "yup";
import { ExtendedAveniaFieldOptions } from "../../../components/Avenia/AveniaField";
import { usePixId, useQuoteFormStoreActions, useTaxId } from "../../../stores/quote/useQuoteFormStore";

export interface UseKYCFormProps {
  cpfApiError: string | null;
}

const getEnumInitialValues = (enumType: Record<string, string>): Record<string, unknown> => {
  return Object.values(enumType).reduce((acc, field) => ({ ...acc, [field]: undefined }), {});
};

const createKycFormSchema = (t: (key: string) => string) =>
  yup
    .object({
      [ExtendedAveniaFieldOptions.TAX_ID]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.taxId.required"))
        .test("is-valid-tax-id", t("components.brlaExtendedForm.validation.taxId.format"), value => {
          if (!value) {
            return false;
          }
          return isValidCpf(value) || isValidCnpj(value);
        }),
      [ExtendedAveniaFieldOptions.PIX_ID]: yup.string().required(t("components.brlaExtendedForm.validation.pixId.required")),

      [ExtendedAveniaFieldOptions.FULL_NAME]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.fullName.required"))
        .min(3, t("components.brlaExtendedForm.validation.fullName.minLength"))
        .matches(/^[a-zA-Z\s]*$/, t("components.brlaExtendedForm.validation.fullName.format")),

      [ExtendedAveniaFieldOptions.CEP]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.cep.required"))
        .min(3, t("components.brlaExtendedForm.validation.cep.minLength")),

      [ExtendedAveniaFieldOptions.CITY]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.city.required"))
        .min(5, t("components.brlaExtendedForm.validation.city.minLength")),

      [ExtendedAveniaFieldOptions.STATE]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.state.required"))
        .max(2, t("components.brlaExtendedForm.validation.state.maxLength")),

      [ExtendedAveniaFieldOptions.STREET]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.street.required"))
        .min(5, t("components.brlaExtendedForm.validation.street.minLength")),

      [ExtendedAveniaFieldOptions.NUMBER]: yup.string().required(t("components.brlaExtendedForm.validation.number.required")),

      [ExtendedAveniaFieldOptions.BIRTHDATE]: yup
        .date()
        .transform((value, originalValue) => {
          return originalValue === "" ? undefined : value;
        })
        .required(t("components.brlaExtendedForm.validation.birthdate.required"))
        .max(new Date(), t("components.brlaExtendedForm.validation.birthdate.future"))
        .min(new Date(1900, 0, 1), t("components.brlaExtendedForm.validation.birthdate.tooOld")),

      [ExtendedAveniaFieldOptions.COMPANY_NAME]: yup
        .string()
        .min(3, t("components.brlaExtendedForm.validation.companyName.minLength")),

      [ExtendedAveniaFieldOptions.START_DATE]: yup
        .date()
        .transform((value, originalValue) => {
          return originalValue === "" ? undefined : value;
        })
        .max(new Date(), t("components.brlaExtendedForm.validation.startDate.future"))
        .min(new Date(1900, 0, 1), t("components.brlaExtendedForm.validation.startDate.tooOld")),

      [ExtendedAveniaFieldOptions.PARTNER_CPF]: yup
        .string()
        .matches(/^\d{3}(\.\d{3}){2}-\d{2}$|^\d{11}$/, t("components.brlaExtendedForm.validation.partnerCpf.format")),
      [ExtendedAveniaFieldOptions.EMAIL]: yup
        .string()
        .email(t("components.brlaExtendedForm.validation.email.format"))
        .required(t("components.brlaExtendedForm.validation.email.required"))
    })
    .required();

export type KYCFormData = yup.InferType<ReturnType<typeof createKycFormSchema>>;

export const useKYCForm = ({ cpfApiError }: UseKYCFormProps) => {
  const { t } = useTranslation();
  const taxIdFromStore = useTaxId();
  const pixIdFromStore = usePixId();

  const { setTaxId, setPixId } = useQuoteFormStoreActions();

  const kycFormSchema = createKycFormSchema(t);

  const kycForm = useForm<KYCFormData>({
    defaultValues: {
      ...getEnumInitialValues(ExtendedAveniaFieldOptions),
      [ExtendedAveniaFieldOptions.TAX_ID]: taxIdFromStore || "",
      [ExtendedAveniaFieldOptions.PIX_ID]: pixIdFromStore || ""
    },
    mode: "onBlur",
    resolver: yupResolver(kycFormSchema)
  });

  const watchedCpf = kycForm.watch(ExtendedAveniaFieldOptions.TAX_ID);
  const watchedPixId = kycForm.watch(ExtendedAveniaFieldOptions.PIX_ID);

  useEffect(() => {
    if (watchedCpf !== undefined && watchedCpf !== taxIdFromStore && watchedCpf !== "") {
      setTaxId(watchedCpf);
    }
  }, [watchedCpf, taxIdFromStore, setTaxId]);

  useEffect(() => {
    if (watchedPixId !== undefined && watchedPixId !== pixIdFromStore && watchedPixId !== "") {
      setPixId(watchedPixId);
    }
  }, [watchedPixId, pixIdFromStore, setPixId]);

  useEffect(() => {
    if (cpfApiError) {
      kycForm.setError(ExtendedAveniaFieldOptions.TAX_ID, {
        message: t("components.brlaExtendedForm.kycFailureReasons.invalidTaxId"),
        type: "invalidTaxId"
      });
    } else {
      if (kycForm.formState.errors[ExtendedAveniaFieldOptions.TAX_ID]?.type === "invalidTaxId") {
        kycForm.clearErrors(ExtendedAveniaFieldOptions.TAX_ID);
      }
    }
  }, [t, cpfApiError, kycForm.setError, kycForm.clearErrors, kycForm.formState.errors]);

  return { kycForm };
};
