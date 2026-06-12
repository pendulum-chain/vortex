import { z } from "zod";
import type { AlfredpayKycFormData } from "../../machines/alfredpayKyc.machine";
import { type KycFormConfig, KycFormScreen } from "./KycFormScreen";

const schema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  dni: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  state: z.string().min(1),
  zipCode: z.string().min(1)
});

type MxnKycFormValues = z.infer<typeof schema>;

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
  schema
};

interface MxnKycFormScreenProps {
  onSubmit: (data: AlfredpayKycFormData) => void;
}

export function MxnKycFormScreen({ onSubmit }: MxnKycFormScreenProps) {
  return <KycFormScreen config={config} onSubmit={onSubmit as (data: MxnKycFormValues) => void} />;
}
