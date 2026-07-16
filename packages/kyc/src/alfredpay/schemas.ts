import { AlfredpayArgentinaDocumentType, AlfredpayColombiaDocumentType } from "@vortexfi/shared";
import { z } from "zod";
import type { KybFormData, KybQuestionnaireData } from "./types";

/** Alfredpay rejects identity documents outside these types, and anything over 5 MB. */
export const KYC_FILE_ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
export const KYC_FILE_MAX_BYTES = 5 * 1024 * 1024;

export const mxnKycSchema = z.object({
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

export const colKycSchema = z
  .object({
    address: z.string().min(1),
    city: z.string().min(1),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
    dni: z.string().min(6).max(10).regex(/^\d+$/, "Must be numeric"),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phoneNumber: z.string().regex(/^\+\d{1,3}\d{9,10}$/, "Use international format, e.g. +573000000000"),
    state: z.string().min(1),
    typeDocumentCol: z.nativeEnum(AlfredpayColombiaDocumentType),
    zipCode: z.string().min(1)
  })
  .superRefine((data, ctx) => {
    if (data.typeDocumentCol === AlfredpayColombiaDocumentType.CC && data.dni.length !== 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CC must be exactly 10 digits", path: ["dni"] });
    }
  });

export const arKycSchema = z
  .object({
    address: z.string().min(1),
    city: z.string().min(1),
    countryCode: z.literal("AR"),
    cuit: z.string().optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
    dni: z.string().min(1),
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    nationalities: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
    pep: z.boolean(),
    phoneNumber: z.string().regex(/^\+54\d{7,}$/, "Use Argentina format (+54...)"),
    state: z.string().min(1),
    typeDocumentAr: z.nativeEnum(AlfredpayArgentinaDocumentType),
    zipCode: z.string().min(1)
  })
  .superRefine((data, ctx) => {
    if (data.cuit && !/^\d{11}$/.test(data.cuit)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CUIT must be exactly 11 digits", path: ["cuit"] });
    }
  });

export const kybFormSchema = z.object({
  address: z.string().min(1),
  businessName: z.string().min(1),
  city: z.string().min(1),
  repDateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  repDni: z.string().optional(),
  repEmail: z.string().email(),
  repFirstName: z.string().min(1),
  repLastName: z.string().min(1),
  repNationality: z.string().regex(/^[A-Z]{2}$/, "Enter a 2-letter country code"),
  // Alfredpay requires `pep` for CO/US/AR and ignores it for MX (the only per-corridor difference in
  // kybRequirements), so it is always asked rather than branched on country.
  repPep: z.boolean(),
  state: z.string().min(1),
  taxId: z.string().min(1),
  website: z.string().url("Enter a valid URL"),
  zipCode: z.string().min(1)
});

/**
 * Alfredpay's compliance questionnaire (GET …/penny/kybRequirements?country= is the source of
 * truth). The two conditionals mirror the provider's own `requiredIf`: it demands
 * `conductsComplianceScreening` once funds are transmitted on a customer's behalf, and a
 * description once screening is claimed. Answering `isRegulatedBusiness` yes additionally requires
 * the business licence and AML policy documents, which the upload step collects.
 */
export const kybQuestionnaireSchema = z
  .object({
    // Trimmed: these are free-text compliance answers Alfredpay stores verbatim, and whitespace
    // satisfies a bare min(1) while telling a reviewer nothing.
    accountPurpose: z.string().trim().min(1),
    businessActivities: z.string().trim().min(1),
    complianceScreeningDescription: z.string().trim().optional(),
    conductsComplianceScreening: z.boolean().optional(),
    expectedMonthlyTransactions: z.number("Enter a number").int("Enter a whole number").min(0),
    expectedMonthlyVolumeUsd: z.number("Enter a number").min(0),
    isRegulatedBusiness: z.boolean(),
    operatesInSanctionedCountries: z.boolean(),
    sourceOfFunds: z.string().trim().min(1),
    transmitsCustomerFunds: z.boolean(),
    walletAddresses: z.string().trim().min(1, "Enter your wallets, or N/A if the business is not on-chain")
  })
  .superRefine((values, ctx) => {
    if (values.transmitsCustomerFunds && values.conductsComplianceScreening === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Answer this when transmitting customer funds",
        path: ["conductsComplianceScreening"]
      });
    }
    if (values.conductsComplianceScreening && !values.complianceScreeningDescription?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Describe the screening your business conducts",
        path: ["complianceScreeningDescription"]
      });
    }
  });

export type MxnKycFormValues = z.infer<typeof mxnKycSchema>;
export type ColKycFormValues = z.infer<typeof colKycSchema>;
export type ArKycFormValues = z.infer<typeof arKycSchema>;
export type KybFormValues = z.infer<typeof kybFormSchema>;
export type KybQuestionnaireValues = z.infer<typeof kybQuestionnaireSchema>;

/** Argentina fields the form pins rather than asks for. */
export const AR_KYC_DEFAULTS: Partial<ArKycFormValues> = {
  countryCode: "AR",
  cuit: "",
  nationalities: ["AR"],
  pep: false,
  typeDocumentAr: AlfredpayArgentinaDocumentType.DNI
};

/** Normalises a typed local number to the `+54…` form Alfredpay expects for Argentina. */
export function toArPhoneNumber(value: string): string {
  if (!value) return value;
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("54") ? `+${digits}` : `+54${digits}`;
}

/** Normalises a typed local number to international form for Colombia. */
export function toColPhoneNumber(value: string): string {
  return value ? `+${value.replace(/^\+/, "").replace(/\D/g, "")}` : value;
}

export function mapKybFormValues(fields: KybFormValues): KybFormData {
  return {
    address: fields.address,
    businessName: fields.businessName,
    city: fields.city,
    relatedPersons: [
      {
        dateOfBirth: fields.repDateOfBirth,
        dni: fields.repDni || undefined,
        email: fields.repEmail,
        firstName: fields.repFirstName,
        lastName: fields.repLastName,
        nationalities: [fields.repNationality],
        pep: fields.repPep
      }
    ],
    state: fields.state,
    taxId: fields.taxId,
    website: fields.website,
    zipCode: fields.zipCode
  };
}

/**
 * Inverse of {@link mapKybFormValues}, for repopulating the company form when the user steps back
 * from the questionnaire. The machine keeps the mapped payload, so without this the form remounts
 * empty and every field has to be retyped.
 */
export function toKybFormValues(data: KybFormData): KybFormValues {
  const representative = data.relatedPersons[0];
  return {
    address: data.address,
    businessName: data.businessName,
    city: data.city,
    repDateOfBirth: representative?.dateOfBirth ?? "",
    repDni: representative?.dni ?? "",
    repEmail: representative?.email ?? "",
    repFirstName: representative?.firstName ?? "",
    repLastName: representative?.lastName ?? "",
    repNationality: representative?.nationalities?.[0] ?? "",
    repPep: representative?.pep ?? false,
    state: data.state,
    taxId: data.taxId,
    website: data.website,
    zipCode: data.zipCode
  };
}

/**
 * Drops the conditional answers when their trigger is false, so a user who toggles
 * "transmits customer funds" on and back off does not submit an orphaned screening description.
 */
export function mapKybQuestionnaireValues(fields: KybQuestionnaireValues): KybQuestionnaireData {
  const transmits = fields.transmitsCustomerFunds;
  const screens = transmits ? fields.conductsComplianceScreening : undefined;
  return {
    accountPurpose: fields.accountPurpose,
    businessActivities: fields.businessActivities,
    complianceScreeningDescription: screens ? fields.complianceScreeningDescription : undefined,
    conductsComplianceScreening: screens,
    expectedMonthlyTransactions: fields.expectedMonthlyTransactions,
    expectedMonthlyVolumeUsd: fields.expectedMonthlyVolumeUsd,
    isRegulatedBusiness: fields.isRegulatedBusiness,
    operatesInSanctionedCountries: fields.operatesInSanctionedCountries,
    sourceOfFunds: fields.sourceOfFunds,
    transmitsCustomerFunds: transmits,
    walletAddresses: fields.walletAddresses
  };
}
