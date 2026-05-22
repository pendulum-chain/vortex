import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { ChangeEvent, ReactNode, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { cn } from "../../helpers/cn";
import type { MykoboKycFiles, MykoboKycFormData } from "../../machines/mykoboKyc.machine";
import { Field } from "../Field";
import { MenuButtons } from "../MenuButtons";
import { StepFooter } from "../StepFooter";

interface MykoboKycFormProps {
  onSubmit: (formData: MykoboKycFormData, files: MykoboKycFiles) => void;
}

type SourceOfFunds = MykoboKycFormData["sourceOfFunds"];
type IdType = MykoboKycFormData["idType"];
type FileKey = "front" | "back" | "face" | "utilityBill";

const SOURCE_OF_FUNDS_OPTIONS: SourceOfFunds[] = ["EMPLOYMENT", "SAVINGS", "LOANS", "INVESTMENT", "INHERITANCE"];
const ID_TYPE_OPTIONS: IdType[] = ["PASSPORT", "ID_CARD", "DRIVERS_LICENSE"];

const SOURCE_OF_FUNDS_LABEL_KEY: Record<SourceOfFunds, string> = {
  EMPLOYMENT: "components.mykoboKycForm.sourceOfFundsEmployment",
  INHERITANCE: "components.mykoboKycForm.sourceOfFundsInheritance",
  INVESTMENT: "components.mykoboKycForm.sourceOfFundsInvestment",
  LOANS: "components.mykoboKycForm.sourceOfFundsLoans",
  SAVINGS: "components.mykoboKycForm.sourceOfFundsSavings"
};

const ID_TYPE_LABEL_KEY: Record<IdType, string> = {
  DRIVERS_LICENSE: "components.mykoboKycForm.idTypeDriversLicense",
  ID_CARD: "components.mykoboKycForm.idTypeIdCard",
  PASSPORT: "components.mykoboKycForm.idTypePassport"
};

const ISO_ALPHA_2_PATTERN = /^[A-Za-z]{2}$/;

const FieldLabel = ({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) => (
  <label className={cn("mb-1 block", className)} htmlFor={htmlFor}>
    {children}
  </label>
);

const selectClass = "input-vortex-primary input-ghost w-full rounded-lg border border-neutral-300 p-2";

interface FileFieldProps {
  label: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  fileName?: string;
  placeholder: string;
}

const FileField = ({ label, inputRef, accept, onChange, fileName, placeholder }: FileFieldProps) => {
  const hasFile = Boolean(fileName);

  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors",
        hasFile ? "border-success bg-success/10" : "border-base-300 hover:border-primary hover:bg-primary/5"
      )}
    >
      <DocumentTextIcon className="mb-2 h-8 w-8 text-gray-400" />
      <span className="mb-1 text-gray-700 text-sm">{label}</span>
      <span className="text-gray-400 text-xs">{fileName || placeholder}</span>
      <input accept={accept} className="hidden" onChange={onChange} ref={inputRef} type="file" />
      {hasFile && <CheckCircleIcon className="absolute top-2 right-2 h-5 w-5 text-success" />}
    </label>
  );
};

export const MykoboKycForm = ({ onSubmit }: MykoboKycFormProps) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<MykoboKycFormData>({
    defaultValues: {
      idType: "PASSPORT",
      sourceOfFunds: "EMPLOYMENT"
    }
  });

  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const faceRef = useRef<HTMLInputElement>(null);
  const utilityRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<Partial<Record<FileKey, string>>>({});

  const setFileName = (key: FileKey) => (event: ChangeEvent<HTMLInputElement>) =>
    setFileNames(prev => ({ ...prev, [key]: event.target.files?.[0]?.name }));

  const idType = watch("idType");
  const backRequired = idType === "ID_CARD" || idType === "DRIVERS_LICENSE";

  const submit = handleSubmit(values => {
    const front = frontRef.current?.files?.[0];
    const face = faceRef.current?.files?.[0];
    const utilityBill = utilityRef.current?.files?.[0];
    const back = backRef.current?.files?.[0];

    if (!front || !face || !utilityBill) {
      setFileError(t("components.mykoboKycForm.filesRequired"));
      return;
    }
    if (backRequired && !back) {
      setFileError(t("components.mykoboKycForm.fileBackRequired"));
      return;
    }
    setFileError(null);
    onSubmit(values, { back: backRequired ? back : undefined, face, front, utilityBill });
  });

  const toUpperCase = (value: unknown): string => (typeof value === "string" ? value.toUpperCase() : "");

  return (
    <form className="relative flex min-h-(--widget-min-height) grow flex-col" onSubmit={submit}>
      <MenuButtons />
      <div className="flex-1 pb-48">
        <h1 className="mt-4 mb-6 text-center font-bold text-3xl text-primary">{t("components.mykoboKycForm.title")}</h1>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="firstName">{t("components.mykoboKycForm.firstName")}</FieldLabel>
            <Field error={Boolean(errors.firstName)} id="firstName" register={register("firstName", { required: true })} />
          </div>
          <div>
            <FieldLabel htmlFor="lastName">{t("components.mykoboKycForm.lastName")}</FieldLabel>
            <Field error={Boolean(errors.lastName)} id="lastName" register={register("lastName", { required: true })} />
          </div>
          <div className="col-span-2">
            <FieldLabel htmlFor="emailAddress">{t("components.mykoboKycForm.emailAddress")}</FieldLabel>
            <Field
              error={Boolean(errors.emailAddress)}
              id="emailAddress"
              register={register("emailAddress", { required: true })}
              type="email"
            />
          </div>
          <div className="col-span-2">
            <FieldLabel htmlFor="addressLine1">{t("components.mykoboKycForm.addressLine1")}</FieldLabel>
            <Field
              error={Boolean(errors.addressLine1)}
              id="addressLine1"
              register={register("addressLine1", { required: true })}
            />
          </div>
          <div>
            <FieldLabel htmlFor="city">{t("components.mykoboKycForm.city")}</FieldLabel>
            <Field error={Boolean(errors.city)} id="city" register={register("city", { required: true })} />
          </div>
          <div>
            <FieldLabel htmlFor="idCountryCode">{t("components.mykoboKycForm.country")}</FieldLabel>
            <Field
              error={Boolean(errors.idCountryCode)}
              id="idCountryCode"
              maxLength={2}
              register={register("idCountryCode", { pattern: ISO_ALPHA_2_PATTERN, required: true, setValueAs: toUpperCase })}
            />
          </div>
          <div className="col-span-2">
            <FieldLabel htmlFor="bankAccountNumber">{t("components.mykoboKycForm.bankAccountNumber")}</FieldLabel>
            <Field
              error={Boolean(errors.bankAccountNumber)}
              id="bankAccountNumber"
              register={register("bankAccountNumber", { required: true })}
            />
          </div>
          <div className="col-span-2">
            <FieldLabel htmlFor="taxCountry">{t("components.mykoboKycForm.taxCountry")}</FieldLabel>
            <Field
              error={Boolean(errors.taxCountry)}
              id="taxCountry"
              maxLength={2}
              register={register("taxCountry", { pattern: ISO_ALPHA_2_PATTERN, required: true, setValueAs: toUpperCase })}
            />
          </div>
          <div className="col-span-2">
            <FieldLabel htmlFor="sourceOfFunds">{t("components.mykoboKycForm.sourceOfFundsLabel")}</FieldLabel>
            <select className={selectClass} id="sourceOfFunds" {...register("sourceOfFunds", { required: true })}>
              {SOURCE_OF_FUNDS_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {t(SOURCE_OF_FUNDS_LABEL_KEY[option])}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <FieldLabel htmlFor="idType">{t("components.mykoboKycForm.idTypeLabel")}</FieldLabel>
            <select className={selectClass} id="idType" {...register("idType", { required: true })}>
              {ID_TYPE_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {t(ID_TYPE_LABEL_KEY[option])}
                </option>
              ))}
            </select>
          </div>
        </div>

        <h2 className="mt-8 mb-4 font-semibold text-primary text-xl">{t("components.mykoboKycForm.documents")}</h2>
        <div className="grid grid-cols-1 gap-4">
          <FileField
            accept="image/*,application/pdf"
            fileName={fileNames.front}
            inputRef={frontRef}
            label={t("components.mykoboKycForm.frontOfId")}
            onChange={setFileName("front")}
            placeholder={t("components.mykoboKycForm.filePlaceholder")}
          />
          {backRequired && (
            <FileField
              accept="image/*,application/pdf"
              fileName={fileNames.back}
              inputRef={backRef}
              label={t("components.mykoboKycForm.backOfId")}
              onChange={setFileName("back")}
              placeholder={t("components.mykoboKycForm.filePlaceholder")}
            />
          )}
          <FileField
            accept="image/*"
            fileName={fileNames.face}
            inputRef={faceRef}
            label={t("components.mykoboKycForm.selfie")}
            onChange={setFileName("face")}
            placeholder={t("components.mykoboKycForm.filePlaceholder")}
          />
          <FileField
            accept="image/*,application/pdf"
            fileName={fileNames.utilityBill}
            inputRef={utilityRef}
            label={t("components.mykoboKycForm.utilityBill")}
            onChange={setFileName("utilityBill")}
            placeholder={t("components.mykoboKycForm.filePlaceholder")}
          />
        </div>

        {fileError && <p className="mt-4 text-error text-sm">{fileError}</p>}
        {Object.keys(errors).length > 0 && <p className="mt-2 text-error text-sm">{t("components.mykoboKycForm.fixErrors")}</p>}
      </div>

      <StepFooter>
        <button className="btn-vortex-primary btn w-full" disabled={isSubmitting} type="submit">
          {t("components.mykoboKycForm.submit")}
        </button>
      </StepFooter>
    </form>
  );
};
