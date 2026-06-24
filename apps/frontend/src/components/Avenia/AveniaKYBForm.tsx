import { useTranslation } from "react-i18next";
import { useAveniaKycActor, useAveniaKycSelector } from "../../contexts/rampState";
import { useKYBForm } from "../../hooks/brla/useKYBForm";
import { MenuButtons } from "../MenuButtons";
import { AveniaFieldProps, ExtendedAveniaFieldOptions } from "./AveniaField";
import { AveniaVerificationForm } from "./AveniaVerificationForm";

export const AveniaKYBForm = () => {
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();

  const { t } = useTranslation();

  const { kybForm } = useKYBForm({
    initialData: {
      fullName: aveniaState?.context.kycFormData?.fullName,
      taxId: aveniaState?.context.taxId
    },
    // No quote-supplied tax ID means the user types it on this form; KYB is business-only, so require a CNPJ.
    requireCnpj: !aveniaState?.context.taxId
  });

  if (!aveniaState) return null;
  if (!aveniaKycActor) return null;
  // Quoted flow pre-supplies the CNPJ from the quote; the KYB deep-link flow has no quote, so the CNPJ
  // is entered here together with the company name. Render whenever either source applies.
  const hasQuoteTaxId = !!aveniaState.context.taxId;
  if (!hasQuoteTaxId && !aveniaState.context.kybLink) {
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
      index: 1,
      label: "CNPJ",
      placeholder: "00.000.000/0000-00",
      readOnly: hasQuoteTaxId,
      required: true,
      type: "text"
    }
  ];

  return (
    <div className="relative flex min-h-(--widget-min-height) grow flex-col">
      <MenuButtons />
      <AveniaVerificationForm
        fields={companyFormFields}
        form={kybForm}
        isCompany={true}
        onSubmit={data => {
          aveniaKycActor.send({ formData: data, type: "FORM_SUBMIT" });
        }}
      />
    </div>
  );
};
