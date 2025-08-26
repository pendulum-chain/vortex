import { useTranslation } from "react-i18next";
import { useAveniaKycActor, useAveniaKycSelector } from "../../contexts/rampState";
import { useKYCForm } from "../../hooks/brla/useKYCForm";
import { isValidCnpj } from "../../hooks/ramp/schema";
import { BrlaFieldProps, ExtendedBrlaFieldOptions } from "./BrlaField";
import { KYCForm } from "./KYCForm";
import { DocumentUpload } from "./KYCLevel2Form";
import { VerificationStatus } from "./VerificationStatus";

export const PIXKYCForm = () => {
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();

  if (!aveniaKycActor) return null;
  if (!aveniaState) return null;

  const { kycForm } = useKYCForm({ cpfApiError: null });
  const { t } = useTranslation();

  if (!aveniaState.context.taxId) {
    return null;
  }

  const pixformFields: BrlaFieldProps[] = [
    {
      id: ExtendedBrlaFieldOptions.FULL_NAME,
      index: 0,
      label: t("components.brlaExtendedForm.form.fullName"),
      placeholder: t("components.brlaExtendedForm.form.fullName"),
      required: true,
      type: "text"
    },
    {
      id: ExtendedBrlaFieldOptions.EMAIL,
      index: 1,
      label: t("components.brlaExtendedForm.form.email"),
      placeholder: t("components.brlaExtendedForm.form.email"),
      required: true,
      type: "email"
    },
    {
      id: ExtendedBrlaFieldOptions.BIRTHDATE,
      index: 2,
      label: t("components.brlaExtendedForm.form.birthdate"),
      required: true,
      type: "date"
    },
    {
      id: ExtendedBrlaFieldOptions.STREET,
      index: 3,
      label: t("components.brlaExtendedForm.form.street"),
      placeholder: t("components.brlaExtendedForm.form.street"),
      required: true,
      type: "text"
    },
    {
      id: ExtendedBrlaFieldOptions.NUMBER,
      index: 4,
      label: t("components.brlaExtendedForm.form.number"),
      placeholder: t("components.brlaExtendedForm.form.number"),
      required: true,
      type: "text"
    },
    {
      id: ExtendedBrlaFieldOptions.CITY,
      index: 5,
      label: t("components.brlaExtendedForm.form.city"),
      placeholder: t("components.brlaExtendedForm.form.city"),
      required: true,
      type: "text"
    },
    {
      id: ExtendedBrlaFieldOptions.STATE,
      index: 6,
      label: t("components.brlaExtendedForm.form.state"),
      options: ["SP", "RJ"],
      placeholder: t("components.brlaExtendedForm.form.state"),
      required: true,
      type: "select"
    },
    {
      id: ExtendedBrlaFieldOptions.CEP,
      index: 7,
      label: "CEP",
      placeholder: "CEP",
      required: true,
      type: "text"
    },
    {
      id: ExtendedBrlaFieldOptions.TAX_ID,
      index: 8,
      label: "CPF",
      placeholder: "",
      required: true,
      type: "text"
    }
  ];

  if (isValidCnpj(aveniaState.context.taxId)) {
    pixformFields.push({
      id: ExtendedBrlaFieldOptions.COMPANY_NAME,
      index: 10,
      label: t("components.brlaExtendedForm.form.companyName"),
      placeholder: t("components.brlaExtendedForm.form.companyName"),
      required: true,
      type: "text"
    });
    pixformFields.push({
      id: ExtendedBrlaFieldOptions.START_DATE,
      index: 11,
      label: t("components.brlaExtendedForm.form.startDate"),
      required: true,
      type: "date"
    });
    pixformFields.push({
      id: ExtendedBrlaFieldOptions.PARTNER_CPF,
      index: 12,
      label: t("components.brlaExtendedForm.form.partnerCpf"),
      required: true,
      type: "text"
    });
  }

  if (aveniaState.stateValue === "Verifying" || aveniaState.stateValue === "Submit") {
    return (
      <div className="relative">
        <VerificationStatus aveniaKycActor={aveniaKycActor} aveniaState={aveniaState} />
      </div>
    );
  }

  if (aveniaState.stateValue === "DocumentUpload") {
    return (
      <div className="relative">
        <DocumentUpload aveniaKycActor={aveniaKycActor} taxId={aveniaState.context.taxId} />
      </div>
    );
  }

  return (
    <div className="relative">
      <KYCForm aveniaKycActor={aveniaKycActor} fields={pixformFields} form={kycForm} />
    </div>
  );
};
