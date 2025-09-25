import { useTranslation } from "react-i18next";
import { useAveniaKycActor, useAveniaKycSelector } from "../../contexts/rampState";
import { useKYCForm } from "../../hooks/brla/useKYCForm";
import { useQuote } from "../../stores/quote/useQuoteStore";
import { DetailsStepQuoteSummary } from "../widget-steps/DetailsStep/DetailsStepQuoteSummary";
import { AveniaFieldProps, ExtendedAveniaFieldOptions } from "./AveniaField";
import { AveniaVerificationForm } from "./AveniaVerificationForm";
import { VerificationStatus } from "./VerificationStatus";

/**
 * AveniaKYBForm - A simplified KYC form for companies (CNPJ)
 * Only collects company name and essential details
 */
export const AveniaKYBForm = () => {
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();
  const quote = useQuote();

  const { kycForm } = useKYCForm({ cpfApiError: null });
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
      required: true,
      type: "text"
    }
  ];

  let content;
  if (
    aveniaState.stateValue === "Verifying" ||
    aveniaState.stateValue === "Submit" ||
    aveniaState.stateValue === "Success" ||
    aveniaState.stateValue === "Rejected" ||
    aveniaState.stateValue === "Failure"
  ) {
    content = <VerificationStatus aveniaKycActor={aveniaKycActor} aveniaState={aveniaState} />;
  } else {
    content = (
      <AveniaVerificationForm aveniaKycActor={aveniaKycActor} fields={companyFormFields} form={kycForm} isCompany={true} />
    );
  }

  return (
    <>
      <div className="relative">{content}</div>
      <DetailsStepQuoteSummary quote={quote} />
    </>
  );
};
