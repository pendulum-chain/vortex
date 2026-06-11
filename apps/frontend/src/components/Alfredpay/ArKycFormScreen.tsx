import { AlfredpayArgentinaDocumentType } from "@vortexfi/shared";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { AlfredpayKycFormData } from "../../machines/alfredpayKyc.machine";
import { type KycFormConfig, KycFormScreen, kycInputClass } from "./KycFormScreen";

const schema = z
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

type ArKycFormValues = z.infer<typeof schema>;
type ArForm = UseFormReturn<ArKycFormValues>;

function DocumentTypeField({ form }: { form: ArForm }) {
  const { t } = useTranslation();
  const error = form.formState.errors.typeDocumentAr;
  return (
    <select
      className={`select w-full rounded-lg border bg-base-200 p-2 text-base ${error ? "border-error" : "border-neutral-300"}`}
      id="ar-typeDocumentAr"
      {...form.register("typeDocumentAr")}
    >
      <option value="DNI">{t("components.arKycForm.options.dni")}</option>
    </select>
  );
}

function DniField({ form }: { form: ArForm }) {
  const { t } = useTranslation();
  const documentType = form.watch("typeDocumentAr");
  const error = form.formState.errors.dni;
  return (
    <input
      className={kycInputClass(!!error)}
      id="ar-dni"
      inputMode="numeric"
      placeholder={documentType === AlfredpayArgentinaDocumentType.DNI ? t("components.arKycForm.dniPlaceholder") : undefined}
      type="text"
      {...form.register("dni")}
    />
  );
}

function PhoneNumberField({ form }: { form: ArForm }) {
  const error = form.formState.errors.phoneNumber;
  return (
    <div className={`flex items-center rounded-lg border ${error ? "border-error" : "border-neutral-300"}`}>
      <span className="select-none border-neutral-300 border-r px-3 py-2 text-base text-gray-500">+</span>
      <input
        autoComplete="tel"
        className="input-vortex-primary input-ghost w-full rounded-r-lg p-2 text-base"
        id="ar-phoneNumber"
        inputMode="tel"
        placeholder="5491112345678"
        type="tel"
        {...form.register("phoneNumber", {
          setValueAs: (value: string) => {
            if (!value) return value;
            const digits = value.replace(/\D/g, "");
            return digits.startsWith("54") ? `+${digits}` : `+54${digits}`;
          }
        })}
      />
    </div>
  );
}

const config: KycFormConfig<ArKycFormValues> = {
  defaultValues: {
    countryCode: "AR",
    cuit: "",
    nationalities: ["AR"],
    pep: false,
    typeDocumentAr: AlfredpayArgentinaDocumentType.DNI
  },
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
    {
      labelKey: "components.arKycForm.phoneNumber",
      name: "phoneNumber",
      render: form => <PhoneNumberField form={form} />,
      type: "custom"
    },
    {
      labelKey: "components.arKycForm.documentType",
      name: "typeDocumentAr",
      render: form => <DocumentTypeField form={form} />,
      type: "custom"
    },
    {
      labelKey: "components.arKycForm.dni",
      name: "dni",
      render: form => <DniField form={form} />,
      type: "custom"
    },
    {
      inputMode: "numeric",
      labelKey: "components.arKycForm.cuit",
      name: "cuit",
      placeholderKey: "components.arKycForm.cuitPlaceholder",
      type: "text"
    },
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
    },
    { labelKey: "components.arKycForm.pepLabel", name: "pep", type: "checkbox" }
  ],
  i18nNamespace: "components.arKycForm",
  idPrefix: "ar",
  schema
};

interface ArKycFormScreenProps {
  onSubmit: (data: AlfredpayKycFormData) => void;
}

export function ArKycFormScreen({ onSubmit }: ArKycFormScreenProps) {
  return <KycFormScreen config={config} onSubmit={onSubmit as (data: ArKycFormValues) => void} />;
}
