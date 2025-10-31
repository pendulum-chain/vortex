import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAveniaKycActor, useAveniaKycSelector } from "../../contexts/rampState";
import { useKYCForm } from "../../hooks/brla/useKYCForm";
import { useQuote } from "../../stores/quote/useQuoteStore";
import { DetailsStepQuoteSummary } from "../widget-steps/DetailsStep/DetailsStepQuoteSummary";
import { AveniaFieldProps, ExtendedAveniaFieldOptions } from "./AveniaField";
import { AveniaVerificationForm } from "./AveniaVerificationForm";

/**
 * AveniaKYBForm - A simplified KYC form for companies (CNPJ)
 * Only collects the company name
 */
export const AveniaKYBForm = () => {
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();
  const quote = useQuote();

  const { kycForm } = useKYCForm({ cpfApiError: null });

  useEffect(() => {
    if (aveniaState?.context.taxId) {
      kycForm.setValue(ExtendedAveniaFieldOptions.TAX_ID, aveniaState.context.taxId);
    }
  }, [aveniaState?.context.taxId, kycForm]);
  const { t } = useTranslation();

  if (!aveniaState) return null;
  if (!aveniaKycActor) return null;
  if (!aveniaState.context.taxId) {
    return null;
  }

  const companyFormFields: AveniaFieldProps[] = [
    {
      id: ExtendedAveniaFieldOptions.FULL_NAME,
      index: 0,
      label: t("components.brlaExtendedForm.form.companyName"),
      placeholder: t("components.brlaExtendedForm.form.companyName"),
      required: true,
      type: "text"
    },
    {
      id: ExtendedAveniaFieldOptions.TAX_ID,
      index: 2,
      label: "CNPJ",
      placeholder: "",
      readOnly: true,
      required: true,
      type: "text"
    }
  ];

  return (
    <>
      <AveniaVerificationForm aveniaKycActor={aveniaKycActor} fields={companyFormFields} form={kycForm} isCompany={true} />
      <DetailsStepQuoteSummary quote={quote} />
    </>
  );
};
