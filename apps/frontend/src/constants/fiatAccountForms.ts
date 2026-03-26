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
    { field: "accountBankCode", label: "Bank Name", required: true, type: "text" },
    { field: "routingNumber", label: "Routing Number (9 digits)", placeholder: "021000021", required: true, type: "text" },
    { field: "accountNumber", label: "Account Number", required: true, type: "text" },
    {
      field: "accountType",
      label: "Account Type",
      options: [
        { label: "Checking", value: "CHECKING" },
        { label: "Savings", value: "SAVINGS" }
      ],
      required: true,
      type: "select"
    },
    { field: "accountName", label: "Account Holder Name", required: true, type: "text" },
    { field: "accountAlias", label: "Nickname (optional)", required: false, type: "text" }
  ],
  SPEI: [
    {
      field: "accountBankCode",
      label: "Bank Name",
      placeholder: "e.g. BBVA, Santander, Banamex",
      required: true,
      type: "text"
    },
    { field: "accountNumber", label: "CLABE (18 digits)", placeholder: "032180000118359719", required: true, type: "text" },
    { field: "accountName", label: "Account Holder Name", required: true, type: "text" },
    { field: "accountAlias", label: "Nickname (optional)", required: false, type: "text" }
  ],
  WIRE: [
    { field: "accountBankCode", label: "Bank Name", required: true, type: "text" },
    { field: "routingNumber", label: "Routing / ABA Number", placeholder: "021000021", required: true, type: "text" },
    { field: "accountNumber", label: "Account Number", required: true, type: "text" },
    { field: "accountName", label: "Account Holder Name", required: true, type: "text" },
    { field: "accountAlias", label: "Nickname (optional)", required: false, type: "text" }
  ]
};
