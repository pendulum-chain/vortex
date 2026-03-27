import type { FiatAccountTypeKey } from "./fiatAccountMethods";

export interface FieldDef {
  field: string;
  hint?: string;
  label: string;
  options?: { label: string; value: string }[];
  placeholder?: string;
  required: boolean;
  type: "text" | "select" | "phone" | "email";
}

export const FORMS: Record<FiatAccountTypeKey, FieldDef[]> = {
  ACH: [
    { field: "accountBankCode", label: "components.fiatAccountForms.bankName", required: true, type: "text" },
    {
      field: "routingNumber",
      label: "components.fiatAccountForms.routingNumber",
      placeholder: "components.fiatAccountForms.placeholders.routingNumber",
      required: true,
      type: "text"
    },
    { field: "accountNumber", label: "components.fiatAccountForms.accountNumber", required: true, type: "text" },
    {
      field: "accountType",
      label: "components.fiatAccountForms.accountType",
      options: [
        { label: "components.fiatAccountForms.options.checking", value: "CHECKING" },
        { label: "components.fiatAccountForms.options.savings", value: "SAVINGS" }
      ],
      required: true,
      type: "select"
    },
    { field: "accountName", label: "components.fiatAccountForms.accountName", required: true, type: "text" },
    { field: "accountAlias", label: "components.fiatAccountForms.accountAlias", required: false, type: "text" }
  ],
  SPEI: [
    {
      field: "accountBankCode",
      label: "components.fiatAccountForms.bankName",
      placeholder: "components.fiatAccountForms.placeholders.bankNameMx",
      required: true,
      type: "text"
    },
    {
      field: "accountNumber",
      label: "components.fiatAccountForms.clabe",
      placeholder: "components.fiatAccountForms.placeholders.clabe",
      required: true,
      type: "text"
    },
    { field: "accountName", label: "components.fiatAccountForms.accountName", required: true, type: "text" },
    { field: "accountAlias", label: "components.fiatAccountForms.accountAlias", required: false, type: "text" }
  ],
  WIRE: [
    { field: "accountBankCode", label: "components.fiatAccountForms.bankName", required: true, type: "text" },
    {
      field: "routingNumber",
      label: "components.fiatAccountForms.routingAba",
      placeholder: "components.fiatAccountForms.placeholders.routingNumber",
      required: true,
      type: "text"
    },
    { field: "accountNumber", label: "components.fiatAccountForms.accountNumber", required: true, type: "text" },
    { field: "accountName", label: "components.fiatAccountForms.accountName", required: true, type: "text" },
    { field: "accountAlias", label: "components.fiatAccountForms.accountAlias", required: false, type: "text" }
  ]
};
