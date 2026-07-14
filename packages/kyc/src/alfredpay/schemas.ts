import type { SubmitKybInformationRequest } from "@vortexfi/shared";
import { AlfredpayArgentinaDocumentType, AlfredpayColombiaDocumentType } from "@vortexfi/shared";
import { z } from "zod";

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
  state: z.string().min(1),
  taxId: z.string().min(1),
  website: z.string().url("Enter a valid URL"),
  zipCode: z.string().min(1)
});

export type MxnKycFormValues = z.infer<typeof mxnKycSchema>;
export type ColKycFormValues = z.infer<typeof colKycSchema>;
export type ArKycFormValues = z.infer<typeof arKycSchema>;
export type KybFormValues = z.infer<typeof kybFormSchema>;

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

export function mapKybFormValues(fields: KybFormValues): Omit<SubmitKybInformationRequest, "country"> {
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
        nationalities: [fields.repNationality]
      }
    ],
    state: fields.state,
    taxId: fields.taxId,
    website: fields.website,
    zipCode: fields.zipCode
  };
}
