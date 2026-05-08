import { isValidCnpj } from "@vortexfi/shared";
import { useTranslation } from "react-i18next";
import { useAveniaKycActor, useAveniaKycSelector } from "../../contexts/rampState";
import { useKYCForm } from "../../hooks/brla/useKYCForm";
import { AveniaKycActorRef, SelectedAveniaData } from "../../machines/types";
import { MenuButtons } from "../MenuButtons";
import { AveniaLivenessStep } from "../widget-steps/AveniaLivenessStep";
import { AveniaFieldProps, ExtendedAveniaFieldOptions } from "./AveniaField";
import { AveniaVerificationForm } from "./AveniaVerificationForm";
import { DocumentUpload } from "./DocumentUpload";
import { VerificationStatus } from "./VerificationStatus";

interface AveniaKYCContentProps {
  aveniaKycActor: AveniaKycActorRef;
  aveniaState: SelectedAveniaData;
  fields: AveniaFieldProps[];
}

const AveniaKYCFormStep = ({ aveniaKycActor, aveniaState, fields }: AveniaKYCContentProps) => {
  const { kycForm } = useKYCForm({ cpfApiError: null, initialData: aveniaState.context.kycFormData });
  return (
    <AveniaVerificationForm
      fields={fields}
      form={kycForm}
      isCompany={false}
      onSubmit={data => {
        aveniaKycActor.send({ formData: data, type: "FORM_SUBMIT" });
      }}
    />
  );
};

const AveniaKYCContent = ({ aveniaKycActor, aveniaState, fields }: AveniaKYCContentProps) => {
  const { stateValue } = aveniaState;

  if (
    stateValue === "Verifying" ||
    stateValue === "Submit" ||
    stateValue === "Success" ||
    stateValue === "Rejected" ||
    stateValue === "Failure"
  ) {
    return <VerificationStatus aveniaKycActor={aveniaKycActor} aveniaState={aveniaState} />;
  }

  if (stateValue === "DocumentUpload") {
    return <DocumentUpload aveniaKycActor={aveniaKycActor} taxId={aveniaState.context.taxId ?? ""} />;
  }

  if (stateValue === "LivenessCheck" || stateValue === "RefreshingLivenessUrl") {
    return <AveniaLivenessStep aveniaKycActor={aveniaKycActor} aveniaState={aveniaState} />;
  }

  return <AveniaKYCFormStep aveniaKycActor={aveniaKycActor} aveniaState={aveniaState} fields={fields} />;
};

export const AveniaKYCForm = () => {
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();

  const { t } = useTranslation();

  if (!aveniaState) return null;
  if (!aveniaKycActor) return null;
  if (!aveniaState.context.taxId) {
    return null;
  }

  const fields: AveniaFieldProps[] = [
    {
      id: ExtendedAveniaFieldOptions.FULL_NAME,
      index: 0,
      label: t("components.brlaExtendedForm.form.fullName"),
      placeholder: t("components.brlaExtendedForm.form.fullName"),
      required: true,
      type: "text"
    },
    {
      id: ExtendedAveniaFieldOptions.EMAIL,
      index: 1,
      label: t("components.brlaExtendedForm.form.email"),
      placeholder: t("components.brlaExtendedForm.form.email"),
      required: true,
      type: "email"
    },
    {
      id: ExtendedAveniaFieldOptions.BIRTHDATE,
      index: 2,
      label: t("components.brlaExtendedForm.form.birthdate"),
      required: true,
      type: "date"
    },
    {
      id: ExtendedAveniaFieldOptions.STREET,
      index: 3,
      label: t("components.brlaExtendedForm.form.street"),
      placeholder: t("components.brlaExtendedForm.form.street"),
      required: true,
      type: "text"
    },
    {
      id: ExtendedAveniaFieldOptions.NUMBER,
      index: 4,
      label: t("components.brlaExtendedForm.form.number"),
      placeholder: t("components.brlaExtendedForm.form.number"),
      required: true,
      type: "text"
    },
    {
      id: ExtendedAveniaFieldOptions.CITY,
      index: 5,
      label: t("components.brlaExtendedForm.form.city"),
      placeholder: t("components.brlaExtendedForm.form.city"),
      required: true,
      type: "text"
    },
    {
      id: ExtendedAveniaFieldOptions.STATE,
      index: 6,
      label: t("components.brlaExtendedForm.form.state"),
      options: ["SP", "RJ"],
      placeholder: t("components.brlaExtendedForm.form.state"),
      required: true,
      type: "select"
    },
    {
      id: ExtendedAveniaFieldOptions.CEP,
      index: 7,
      label: "CEP",
      placeholder: "CEP",
      required: true,
      type: "text"
    },
    {
      id: ExtendedAveniaFieldOptions.TAX_ID,
      index: 8,
      label: "CPF",
      placeholder: "",
      required: true,
      type: "text"
    }
  ];

  if (isValidCnpj(aveniaState.context.taxId)) {
    fields.push({
      id: ExtendedAveniaFieldOptions.COMPANY_NAME,
      index: 10,
      label: t("components.brlaExtendedForm.form.companyName"),
      placeholder: t("components.brlaExtendedForm.form.companyName"),
      required: true,
      type: "text"
    });
    fields.push({
      id: ExtendedAveniaFieldOptions.START_DATE,
      index: 11,
      label: t("components.brlaExtendedForm.form.startDate"),
      required: true,
      type: "date"
    });
    fields.push({
      id: ExtendedAveniaFieldOptions.PARTNER_CPF,
      index: 12,
      label: t("components.brlaExtendedForm.form.partnerCpf"),
      required: true,
      type: "text"
    });
  }

  return (
    <div className="relative flex min-h-(--widget-min-height) grow flex-col">
      <MenuButtons />
      <AveniaKYCContent aveniaKycActor={aveniaKycActor} aveniaState={aveniaState} fields={fields} />
    </div>
  );
};
