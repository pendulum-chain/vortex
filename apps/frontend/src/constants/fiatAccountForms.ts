import type { FiatAccountTypeKey } from "./fiatAccountMethods";

export interface FieldDef {
  field: string;
  hint?: string;
  label: string;
  options?: { label: string; value: string }[];
  placeholder?: string;
  required: boolean;
  defaultValue?: string;
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
    { field: "accountAlias", label: "components.fiatAccountForms.accountAlias", required: false, type: "text" },
    {
      defaultValue: "own",
      field: "isOwnAccount",
      label: "components.fiatAccountForms.isOwnAccount",
      options: [
        { label: "components.fiatAccountForms.options.ownAccount", value: "own" },
        { label: "components.fiatAccountForms.options.externalAccount", value: "external" }
      ],
      required: true,
      type: "select"
    }
  ],
  ACH_COL: [
    { field: "accountBankCode", label: "components.fiatAccountForms.bankName", required: true, type: "text" },
    {
      field: "accountNumber",
      label: "components.fiatAccountForms.accountNumber",
      placeholder: "components.fiatAccountForms.placeholders.accountNumberCo",
      required: true,
      type: "text"
    },
    {
      field: "accountType",
      label: "components.fiatAccountForms.accountType",
      options: [
        { label: "components.fiatAccountForms.options.corriente", value: "CORRIENTE" },
        { label: "components.fiatAccountForms.options.ahorro", value: "AHORRO" },
        { label: "components.fiatAccountForms.options.nequi", value: "NEQUI" }
      ],
      required: true,
      type: "select"
    },
    { field: "accountName", label: "components.fiatAccountForms.accountName", required: true, type: "text" },
    { field: "documentType", label: "components.fiatAccountForms.documentType", required: true, type: "text" },
    { field: "documentNumber", label: "components.fiatAccountForms.documentNumber", required: true, type: "text" },
    {
      defaultValue: "own",
      field: "isOwnAccount",
      label: "components.fiatAccountForms.isOwnAccount",
      options: [
        { label: "components.fiatAccountForms.options.ownAccount", value: "own" },
        { label: "components.fiatAccountForms.options.externalAccount", value: "external" }
      ],
      required: true,
      type: "select"
    }
  ],
  SPEI: [
    {
      field: "accountNumber",
      label: "components.fiatAccountForms.clabe",
      placeholder: "components.fiatAccountForms.placeholders.clabe",
      required: true,
      type: "text"
    },
    { field: "accountName", label: "components.fiatAccountForms.accountName", required: true, type: "text" },
    {
      defaultValue: "own",
      field: "isOwnAccount",
      label: "components.fiatAccountForms.isOwnAccount",
      options: [
        { label: "components.fiatAccountForms.options.ownAccount", value: "own" },
        { label: "components.fiatAccountForms.options.externalAccount", value: "external" }
      ],
      required: true,
      type: "select"
    }
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
    {
      field: "accountType",
      label: "components.fiatAccountForms.accountType",
      options: [
        { label: "components.fiatAccountForms.options.checking", value: "CHECKING" },
        { label: "components.fiatAccountForms.options.saving", value: "SAVING" }
      ],
      required: true,
      type: "select"
    },
    { field: "bankStreet", label: "components.fiatAccountForms.bankStreet", required: true, type: "text" },
    { field: "bankCity", label: "components.fiatAccountForms.bankCity", required: true, type: "text" },
    { field: "bankState", label: "components.fiatAccountForms.bankState", required: true, type: "text" },
    {
      field: "bankCountry",
      hint: "components.fiatAccountForms.hints.bankCountry",
      label: "components.fiatAccountForms.bankCountry",
      placeholder: "components.fiatAccountForms.placeholders.bankCountry",
      required: true,
      type: "text"
    },
    { field: "bankPostalCode", label: "components.fiatAccountForms.bankPostalCode", required: true, type: "text" },
    {
      defaultValue: "own",
      field: "isOwnAccount",
      label: "components.fiatAccountForms.isOwnAccount",
      options: [
        { label: "components.fiatAccountForms.options.ownAccount", value: "own" },
        { label: "components.fiatAccountForms.options.externalAccount", value: "external" }
      ],
      required: true,
      type: "select"
    }
  ]
};
