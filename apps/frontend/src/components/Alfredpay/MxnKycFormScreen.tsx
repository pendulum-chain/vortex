import { type AlfredpayKycFormData, type MxnKycFormValues, mxnKycSchema } from "@vortexfi/kyc";
import { type KycFormConfig, KycFormScreen } from "./KycFormScreen";

const config: KycFormConfig<MxnKycFormValues> = {
  fields: [
    {
      fields: [
        { autoComplete: "given-name", labelKey: "components.mxnKycForm.firstName", name: "firstName", type: "text" },
        { autoComplete: "family-name", labelKey: "components.mxnKycForm.lastName", name: "lastName", type: "text" }
      ],
      type: "group"
    },
    {
      inputType: "date",
      labelKey: "components.mxnKycForm.dateOfBirth",
      name: "dateOfBirth",
      placeholder: "YYYY-MM-DD",
      type: "text"
    },
    {
      autoComplete: "email",
      inputMode: "email",
      inputType: "email",
      labelKey: "components.mxnKycForm.email",
      name: "email",
      type: "text"
    },
    { labelKey: "components.mxnKycForm.dni", name: "dni", placeholder: "CURP / INE number", type: "text" },
    {
      autoComplete: "street-address",
      labelKey: "components.mxnKycForm.address",
      name: "address",
      type: "text"
    },
    {
      fields: [
        { autoComplete: "address-level2", labelKey: "components.mxnKycForm.city", name: "city", type: "text" },
        { autoComplete: "address-level1", labelKey: "components.mxnKycForm.state", name: "state", type: "text" }
      ],
      type: "group"
    },
    {
      autoComplete: "postal-code",
      inputMode: "numeric",
      labelKey: "components.mxnKycForm.zipCode",
      name: "zipCode",
      type: "text"
    }
  ],
  i18nNamespace: "components.mxnKycForm",
  idPrefix: "mxn",
  schema: mxnKycSchema
};

interface MxnKycFormScreenProps {
  onSubmit: (data: AlfredpayKycFormData) => void;
  userEmail?: string;
}

export function MxnKycFormScreen({ onSubmit, userEmail }: MxnKycFormScreenProps) {
  return <KycFormScreen config={config} lockedEmail={userEmail} onSubmit={onSubmit as (data: MxnKycFormValues) => void} />;
}
