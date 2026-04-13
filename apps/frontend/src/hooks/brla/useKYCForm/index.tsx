import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { isValidCnpj, isValidCpf } from "@vortexfi/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ExtendedAveniaFieldOptions } from "../../../components/Avenia/AveniaField";
import { usePixId, useQuoteFormStoreActions, useTaxId } from "../../../stores/quote/useQuoteFormStore";

const toISODateString = (date: Date): string => date.toISOString().split("T")[0];

export interface UseKYCFormProps {
  cpfApiError: string | null;
  initialData?: KYCFormData;
}

const createKycFormSchema = (t: (key: string) => string) =>
  z.object({
    [ExtendedAveniaFieldOptions.TAX_ID]: z
      .string()
      .min(1, t("components.brlaExtendedForm.validation.taxId.required"))
      .refine(value => isValidCpf(value) || isValidCnpj(value), t("components.brlaExtendedForm.validation.taxId.format")),

    [ExtendedAveniaFieldOptions.PIX_ID]: z.string().min(1, t("components.brlaExtendedForm.validation.pixId.required")),

    [ExtendedAveniaFieldOptions.FULL_NAME]: z
      .string()
      .min(1, t("components.brlaExtendedForm.validation.fullName.required"))
      .min(3, t("components.brlaExtendedForm.validation.fullName.minLength"))
      .regex(/^[a-zA-Z\s]*$/, t("components.brlaExtendedForm.validation.fullName.format")),

    [ExtendedAveniaFieldOptions.CEP]: z
      .string()
      .min(1, t("components.brlaExtendedForm.validation.cep.required"))
      .min(3, t("components.brlaExtendedForm.validation.cep.minLength")),

    [ExtendedAveniaFieldOptions.CITY]: z
      .string()
      .min(1, t("components.brlaExtendedForm.validation.city.required"))
      .min(5, t("components.brlaExtendedForm.validation.city.minLength")),

    [ExtendedAveniaFieldOptions.STATE]: z
      .string()
      .min(1, t("components.brlaExtendedForm.validation.state.required"))
      .max(2, t("components.brlaExtendedForm.validation.state.maxLength")),

    [ExtendedAveniaFieldOptions.STREET]: z
      .string()
      .min(1, t("components.brlaExtendedForm.validation.street.required"))
      .min(5, t("components.brlaExtendedForm.validation.street.minLength")),

    [ExtendedAveniaFieldOptions.NUMBER]: z.string().min(1, t("components.brlaExtendedForm.validation.number.required")),

    [ExtendedAveniaFieldOptions.BIRTHDATE]: z.preprocess(
      val => (val === "" || val === undefined ? undefined : new Date(val as string)),
      z
        .date({ error: () => t("components.brlaExtendedForm.validation.birthdate.required") })
        .max(new Date(), t("components.brlaExtendedForm.validation.birthdate.future"))
        .min(new Date(1900, 0, 1), t("components.brlaExtendedForm.validation.birthdate.tooOld"))
        .refine(value => {
          const ageDate = new Date(value);
          ageDate.setFullYear(ageDate.getFullYear() + 18);
          return ageDate <= new Date();
        }, t("components.brlaExtendedForm.validation.birthdate.tooYoung"))
        .transform(toISODateString)
    ),

    [ExtendedAveniaFieldOptions.COMPANY_NAME]: z.preprocess(
      val => (val === "" ? undefined : val),
      z.string().min(3, t("components.brlaExtendedForm.validation.companyName.minLength")).optional()
    ),

    [ExtendedAveniaFieldOptions.START_DATE]: z.preprocess(
      val => (val === "" || val === undefined ? undefined : new Date(val as string)),
      z
        .date()
        .max(new Date(), t("components.brlaExtendedForm.validation.startDate.future"))
        .min(new Date(1900, 0, 1), t("components.brlaExtendedForm.validation.startDate.tooOld"))
        .optional()
    ),

    [ExtendedAveniaFieldOptions.PARTNER_CPF]: z.preprocess(
      val => (val === "" ? undefined : val),
      z
        .string()
        .regex(/^\d{3}(\.\d{3}){2}-\d{2}$|^\d{11}$/, t("components.brlaExtendedForm.validation.partnerCpf.format"))
        .optional()
    ),

    [ExtendedAveniaFieldOptions.EMAIL]: z
      .string()
      .min(1, t("components.brlaExtendedForm.validation.email.required"))
      .pipe(z.email(t("components.brlaExtendedForm.validation.email.format")))
  });

export type KYCFormData = z.infer<ReturnType<typeof createKycFormSchema>>;

export const useKYCForm = ({ cpfApiError, initialData }: UseKYCFormProps) => {
  const { t } = useTranslation();
  const taxIdFromStore = useTaxId();
  const pixIdFromStore = usePixId();

  const { setTaxId, setPixId } = useQuoteFormStoreActions();

  const kycForm = useForm<KYCFormData>({
    defaultValues: {
      ...initialData,
      [ExtendedAveniaFieldOptions.TAX_ID]: initialData?.taxId || taxIdFromStore || "",
      [ExtendedAveniaFieldOptions.PIX_ID]: initialData?.pixId || pixIdFromStore || ""
    },
    mode: "onBlur",
    resolver: standardSchemaResolver(createKycFormSchema(t))
  });

  useEffect(() => {
    const subscription = kycForm.watch((values, { name }) => {
      if (name === ExtendedAveniaFieldOptions.TAX_ID && values.taxId && values.taxId !== taxIdFromStore) {
        setTaxId(values.taxId);
      }
      if (name === ExtendedAveniaFieldOptions.PIX_ID && values.pixId && values.pixId !== pixIdFromStore) {
        setPixId(values.pixId);
      }
    });
    return () => subscription.unsubscribe();
  }, [kycForm, taxIdFromStore, pixIdFromStore, setTaxId, setPixId]);

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
  }, [t, cpfApiError, kycForm]);

  return { kycForm };
};
