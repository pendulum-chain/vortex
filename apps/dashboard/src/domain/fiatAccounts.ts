import { type AlfredpayAddFiatAccountRequest, AlfredpayFiatAccountType } from "@vortexfi/shared";
import { z } from "zod";

export type AlfredpayCorridorId = "AR" | "CO" | "MX" | "US";

export interface FiatAccountField {
  defaultValue?: string;
  label: string;
  name: string;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  type: "select" | "text";
}

interface FiatAccountConfig {
  fields: FiatAccountField[];
  methodLabel: string;
  type: AlfredpayFiatAccountType;
}

// Ported from apps/frontend/src/constants/fiatAccountForms.ts and fiatAccountMethods.ts.
// AR and US have no holder-name field: the API's COELSA and BANK_USA mappings never
// forward one to the provider, so collecting it would gather unused PII.
export const FIAT_ACCOUNT_CONFIG: Record<AlfredpayCorridorId, FiatAccountConfig> = {
  AR: {
    fields: [
      { label: "CBU / CVU or alias", name: "accountNumber", placeholder: "22-digit CBU/CVU or alias", type: "text" },
      {
        label: "Account type",
        name: "accountType",
        options: [
          { label: "CBU", value: "CBU" },
          { label: "CVU", value: "CVU" },
          { label: "Alias", value: "ALIAS" }
        ],
        type: "select"
      }
    ],
    methodLabel: "COELSA",
    type: AlfredpayFiatAccountType.COELSA
  },
  CO: {
    fields: [
      { label: "Bank name", name: "accountBankCode", type: "text" },
      { label: "Account number", name: "accountNumber", type: "text" },
      {
        label: "Account type",
        name: "accountType",
        options: [
          { label: "Corriente", value: "CORRIENTE" },
          { label: "Ahorro", value: "AHORRO" },
          { label: "Nequi", value: "NEQUI" }
        ],
        type: "select"
      },
      { label: "Account holder name", name: "accountName", type: "text" },
      { label: "Document type", name: "documentType", type: "text" },
      { label: "Document number", name: "documentNumber", type: "text" }
    ],
    methodLabel: "ACH Colombia",
    type: AlfredpayFiatAccountType.ACH
  },
  MX: {
    fields: [
      { label: "CLABE", name: "accountNumber", placeholder: "18-digit CLABE", type: "text" },
      { label: "Account holder name", name: "accountName", type: "text" }
    ],
    methodLabel: "SPEI",
    type: AlfredpayFiatAccountType.SPEI
  },
  US: {
    fields: [
      { label: "Bank name", name: "accountBankCode", type: "text" },
      { label: "Routing number", name: "routingNumber", placeholder: "9-digit routing number", type: "text" },
      {
        defaultValue: "CHECKING",
        label: "Account type",
        name: "accountType",
        options: [{ label: "Checking", value: "CHECKING" }],
        type: "select"
      },
      { label: "Account number", name: "accountNumber", type: "text" }
    ],
    methodLabel: "US bank account",
    type: AlfredpayFiatAccountType.BANK_USA
  }
};

export function buildFiatAccountSchema(corridorId: AlfredpayCorridorId) {
  const fields = FIAT_ACCOUNT_CONFIG[corridorId].fields;
  const shape = Object.fromEntries(
    fields.map(field => {
      let schema = z.string().min(1, `${field.label} is required`);
      if (field.name === "accountNumber" && corridorId === "MX") {
        schema = z.string().regex(/^\d{18}$/, "Enter an 18-digit CLABE");
      } else if (field.name === "accountNumber" && corridorId === "CO") {
        schema = z.string().regex(/^\d{10,11}$/, "Enter a 10 or 11-digit account number");
      } else if (field.name === "accountNumber" && corridorId === "US") {
        schema = z.string().regex(/^\d{8,34}$/, "Enter an 8 to 34-digit account number");
      } else if (field.name === "routingNumber") {
        schema = z.string().regex(/^\d{9}$/, "Enter a 9-digit routing number");
      }
      return [field.name, schema];
    })
  );
  return z.object(shape);
}

export function fiatAccountDefaultValues(corridorId: AlfredpayCorridorId): Record<string, string> {
  return Object.fromEntries(FIAT_ACCOUNT_CONFIG[corridorId].fields.map(field => [field.name, field.defaultValue ?? ""]));
}

export function toAddFiatAccountRequest(
  corridorId: AlfredpayCorridorId,
  values: Record<string, string | undefined>
): AlfredpayAddFiatAccountRequest {
  return {
    accountBankCode: values.accountBankCode,
    accountName: values.accountName,
    accountNumber: values.accountNumber ?? "",
    accountType: values.accountType,
    country: corridorId,
    documentNumber: values.documentNumber,
    documentType: values.documentType,
    isExternal: false,
    routingNumber: values.routingNumber,
    type: FIAT_ACCOUNT_CONFIG[corridorId].type
  };
}
