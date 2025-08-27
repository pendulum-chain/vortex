import { yupResolver } from "@hookform/resolvers/yup";
import { useSelector } from "@xstate/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as yup from "yup";
import { ExtendedBrlaFieldOptions } from "../../../components/BrlaComponents/BrlaField";
import { useRampActor } from "../../../contexts/rampState";
import { useQuoteFormStore, useQuoteFormStoreActions } from "../../../stores/quote/useQuoteFormStore";
import { isValidCnpj, isValidCpf } from "../../ramp/schema";

export interface UseKYCFormProps {
  cpfApiError: string | null;
}

const getEnumInitialValues = (enumType: Record<string, string>): Record<string, unknown> => {
  return Object.values(enumType).reduce((acc, field) => ({ ...acc, [field]: undefined }), {});
};

const createKycFormSchema = (t: (key: string) => string) =>
  yup
    .object({
      [ExtendedBrlaFieldOptions.TAX_ID]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.taxId.required"))
        .test("is-valid-tax-id", t("components.brlaExtendedForm.validation.taxId.format"), value => {
          if (!value) {
            return false;
          }
          return isValidCpf(value) || isValidCnpj(value);
        }),
      [ExtendedBrlaFieldOptions.PIX_ID]: yup.string().required(t("components.brlaExtendedForm.validation.pixId.required")),
      [ExtendedBrlaFieldOptions.PHONE]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.phone.required"))
        .matches(/^\+?[1-9]\d{9,14}$/, t("components.brlaExtendedForm.validation.phone.format")),

      [ExtendedBrlaFieldOptions.FULL_NAME]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.fullName.required"))
        .min(3, t("components.brlaExtendedForm.validation.fullName.minLength"))
        .matches(/^[a-zA-Z\s]*$/, t("components.brlaExtendedForm.validation.fullName.format")),

      [ExtendedBrlaFieldOptions.CEP]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.cep.required"))
        .min(3, t("components.brlaExtendedForm.validation.cep.minLength")),

      [ExtendedBrlaFieldOptions.CITY]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.city.required"))
        .min(5, t("components.brlaExtendedForm.validation.city.minLength")),

      [ExtendedBrlaFieldOptions.STATE]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.state.required"))
        .min(3, t("components.brlaExtendedForm.validation.state.minLength")),

      [ExtendedBrlaFieldOptions.STREET]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.street.required"))
        .min(5, t("components.brlaExtendedForm.validation.street.minLength")),

      [ExtendedBrlaFieldOptions.NUMBER]: yup.string().required(t("components.brlaExtendedForm.validation.number.required")),

      [ExtendedBrlaFieldOptions.DISTRICT]: yup
        .string()
        .required(t("components.brlaExtendedForm.validation.district.required"))
        .min(3, t("components.brlaExtendedForm.validation.district.minLength")),

      [ExtendedBrlaFieldOptions.BIRTHDATE]: yup
        .date()
        .transform((value, originalValue) => {
          return originalValue === "" ? undefined : value;
        })
        .required(t("components.brlaExtendedForm.validation.birthdate.required"))
        .max(new Date(), t("components.brlaExtendedForm.validation.birthdate.future"))
        .min(new Date(1900, 0, 1), t("components.brlaExtendedForm.validation.birthdate.tooOld")),

      [ExtendedBrlaFieldOptions.COMPANY_NAME]: yup
        .string()
        .min(3, t("components.brlaExtendedForm.validation.companyName.minLength")),

      [ExtendedBrlaFieldOptions.START_DATE]: yup
        .date()
        .transform((value, originalValue) => {
          return originalValue === "" ? undefined : value;
        })
        .max(new Date(), t("components.brlaExtendedForm.validation.startDate.future"))
        .min(new Date(1900, 0, 1), t("components.brlaExtendedForm.validation.startDate.tooOld")),

      [ExtendedBrlaFieldOptions.PARTNER_CPF]: yup
        .string()
        .matches(/^\d{3}(\.\d{3}){2}-\d{2}$|^\d{11}$/, t("components.brlaExtendedForm.validation.partnerCpf.format"))
    })
    .required();

export type KYCFormData = yup.InferType<ReturnType<typeof createKycFormSchema>>;

export const useKYCForm = ({ cpfApiError }: UseKYCFormProps) => {
  const { t } = useTranslation();
  const { taxId: taxIdFromStore, pixId: pixIdFromStore } = useQuoteFormStore();
  const rampActor = useRampActor();
  const { executionInput } = useSelector(rampActor, state => ({
    executionInput: state.context.executionInput
  }));
  const { setTaxId, setPixId } = useQuoteFormStoreActions();

  const kycFormSchema = createKycFormSchema(t);

  const kycForm = useForm<KYCFormData>({
    defaultValues: {
      ...getEnumInitialValues(ExtendedBrlaFieldOptions),
      [ExtendedBrlaFieldOptions.TAX_ID]: taxIdFromStore || "",
      [ExtendedBrlaFieldOptions.PIX_ID]: pixIdFromStore || ""
    },
    mode: "onBlur",
    resolver: yupResolver(kycFormSchema)
  });

  const watchedCpf = kycForm.watch(ExtendedBrlaFieldOptions.TAX_ID);
  const watchedPixId = kycForm.watch(ExtendedBrlaFieldOptions.PIX_ID);

  useEffect(() => {
    if (watchedCpf !== undefined && watchedCpf !== taxIdFromStore && watchedCpf !== "") {
      setTaxId(watchedCpf);
    }
  }, [watchedCpf, taxIdFromStore, setTaxId, executionInput, rampActor]);

  useEffect(() => {
    if (watchedPixId !== undefined && watchedPixId !== pixIdFromStore && watchedPixId !== "") {
      setPixId(watchedPixId);
    }
  }, [watchedPixId, pixIdFromStore, setPixId, executionInput, rampActor]);

  useEffect(() => {
    if (cpfApiError) {
      kycForm.setError(ExtendedBrlaFieldOptions.TAX_ID, {
        message: t("components.brlaExtendedForm.kycFailureReasons.invalidTaxId"),
        type: "invalidTaxId"
      });
    } else {
      if (kycForm.formState.errors[ExtendedBrlaFieldOptions.TAX_ID]?.type === "invalidTaxId") {
        kycForm.clearErrors(ExtendedBrlaFieldOptions.TAX_ID);
      }
    }
  }, [t, cpfApiError, kycForm.setError, kycForm.clearErrors, kycForm.formState.errors]);

  return { kycForm };
};
