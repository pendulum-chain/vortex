import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAveniaKycActor, useAveniaKycSelector } from "../../contexts/rampState";
import { useKYCForm } from "../../hooks/brla/useKYCForm";
import { useQuote } from "../../stores/quote/useQuoteStore";
import { QuoteSummary } from "../QuoteSummary";
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

  const [quoteSummaryHeight, setQuoteSummaryHeight] = useState(100);

  return (
    <div
      className="relative flex h-full grow flex-col"
      style={{ "--quote-summary-height": `${quoteSummaryHeight}px` } as React.CSSProperties}
    >
      <div className="flex flex-col flex-1">
        <AveniaVerificationForm aveniaKycActor={aveniaKycActor} fields={companyFormFields} form={kycForm} isCompany={true} />
      </div>
      {quote && <QuoteSummary onHeightChange={setQuoteSummaryHeight} quote={quote} />}
    </div>
  );
};
