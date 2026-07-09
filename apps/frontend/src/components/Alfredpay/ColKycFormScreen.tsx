import { type AlfredpayKycFormData, type ColKycFormValues, colKycSchema, toColPhoneNumber } from "@vortexfi/kyc";
import { AlfredpayColombiaDocumentType } from "@vortexfi/shared";
import { Controller, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { type KycFormConfig, KycFormScreen, kycInputClass } from "./KycFormScreen";

type ColForm = UseFormReturn<ColKycFormValues>;

function DocumentTypeField({ form }: { form: ColForm }) {
  const { t } = useTranslation();
  const error = form.formState.errors.typeDocumentCol;
  return (
    <Controller
      control={form.control}
      name="typeDocumentCol"
      render={({ field }) => (
        <Select onValueChange={field.onChange} value={field.value}>
          <SelectTrigger className={`w-full ${error ? "border-error" : ""}`} id="col-typeDocumentCol">
            <SelectValue placeholder={t("components.colKycForm.selectDocumentType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CC">{t("components.colKycForm.options.cc")}</SelectItem>
            <SelectItem value="CE">{t("components.colKycForm.options.ce")}</SelectItem>
          </SelectContent>
        </Select>
      )}
    />
  );
}

function DniField({ form }: { form: ColForm }) {
  const { t } = useTranslation();
  const documentType = form.watch("typeDocumentCol");
  const error = form.formState.errors.dni;
  return (
    <input
      className={kycInputClass(!!error)}
      id="col-dni"
      inputMode="numeric"
      placeholder={
        documentType === AlfredpayColombiaDocumentType.CC
          ? t("components.colKycForm.dniPlaceholderCc")
          : t("components.colKycForm.dniPlaceholderCe")
      }
      type="text"
      {...form.register("dni")}
    />
  );
}

function PhoneNumberField({ form }: { form: ColForm }) {
  const error = form.formState.errors.phoneNumber;
  return (
    <div className={`flex items-center rounded-lg border ${error ? "border-error" : "border-neutral-300"}`}>
      <span className="select-none border-neutral-300 border-r px-3 py-2 text-base text-gray-500">+</span>
      <input
        autoComplete="tel"
        className="input-vortex-primary input-ghost w-full rounded-r-lg p-2 text-base"
        id="col-phoneNumber"
        inputMode="tel"
        placeholder="573000000000"
        type="tel"
        {...form.register("phoneNumber", { setValueAs: toColPhoneNumber })}
      />
    </div>
  );
}

const config: KycFormConfig<ColKycFormValues> = {
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
      labelKey: "components.colKycForm.documentType",
      name: "typeDocumentCol",
      render: form => <DocumentTypeField form={form} />,
      type: "custom"
    },
    {
      labelKey: "components.colKycForm.dni",
      name: "dni",
      render: form => <DniField form={form} />,
      type: "custom"
    },
    {
      labelKey: "components.colKycForm.phoneNumber",
      name: "phoneNumber",
      render: form => <PhoneNumberField form={form} />,
      type: "custom"
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
    }
  ],
  i18nNamespace: "components.colKycForm",
  idPrefix: "col",
  schema: colKycSchema
};

interface ColKycFormScreenProps {
  onSubmit: (data: AlfredpayKycFormData) => void;
}

export function ColKycFormScreen({ onSubmit }: ColKycFormScreenProps) {
  return <KycFormScreen config={config} onSubmit={onSubmit as (data: ColKycFormValues) => void} />;
}
