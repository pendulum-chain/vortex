import { zodResolver } from "@hookform/resolvers/zod";
import { AlfredpayColombiaDocumentType } from "@vortexfi/shared";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { MenuButtons } from "../MenuButtons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const schema = z
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

type ColKycFormValues = z.infer<typeof schema>;

interface ColKycFormScreenProps {
  onSubmit: (data: ColKycFormValues) => void;
}

export function ColKycFormScreen({ onSubmit }: ColKycFormScreenProps) {
  const { t } = useTranslation();

  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    watch
  } = useForm<ColKycFormValues>({ resolver: zodResolver(schema) });

  const documentType = watch("typeDocumentCol");

  const inputClass = (hasError: boolean) =>
    `input-vortex-primary input-ghost w-full rounded-lg border p-2 text-base ${hasError ? "border-error" : "border-neutral-300"}`;

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      <h1 className="mt-4 mb-2 text-center font-bold text-2xl text-primary">{t("components.colKycForm.title")}</h1>
      <p className="mb-4 text-center text-gray-500 text-sm">{t("components.colKycForm.subtitle")}</p>

      <form className="flex grow-1 flex-col space-y-3 overflow-y-auto px-1 pb-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm" htmlFor="col-firstName">
              {t("components.mxnKycForm.firstName")}
            </label>
            <input
              autoComplete="given-name"
              className={inputClass(!!errors.firstName)}
              id="col-firstName"
              type="text"
              {...register("firstName")}
            />
            {errors.firstName && <span className="mt-1 block text-error text-xs">{errors.firstName.message}</span>}
          </div>

          <div>
            <label className="mb-1 block text-sm" htmlFor="col-lastName">
              {t("components.mxnKycForm.lastName")}
            </label>
            <input
              autoComplete="family-name"
              className={inputClass(!!errors.lastName)}
              id="col-lastName"
              type="text"
              {...register("lastName")}
            />
            {errors.lastName && <span className="mt-1 block text-error text-xs">{errors.lastName.message}</span>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="col-dateOfBirth">
            {t("components.mxnKycForm.dateOfBirth")}
          </label>
          <input
            className={inputClass(!!errors.dateOfBirth)}
            id="col-dateOfBirth"
            placeholder="YYYY-MM-DD"
            type="date"
            {...register("dateOfBirth")}
          />
          {errors.dateOfBirth && <span className="mt-1 block text-error text-xs">{errors.dateOfBirth.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="col-documentType">
            {t("components.colKycForm.documentType")}
          </label>
          <Controller
            control={control}
            name="typeDocumentCol"
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger className={`w-full ${errors.typeDocumentCol ? "border-error" : ""}`} id="col-documentType">
                  <SelectValue placeholder={t("components.colKycForm.selectDocumentType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CC">{t("components.colKycForm.options.cc")}</SelectItem>
                  <SelectItem value="CE">{t("components.colKycForm.options.ce")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {errors.typeDocumentCol && <span className="mt-1 block text-error text-xs">{errors.typeDocumentCol.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="col-dni">
            {t("components.colKycForm.dni")}
          </label>
          <input
            className={inputClass(!!errors.dni)}
            id="col-dni"
            inputMode="numeric"
            placeholder={
              documentType === AlfredpayColombiaDocumentType.CC
                ? t("components.colKycForm.dniPlaceholderCc")
                : t("components.colKycForm.dniPlaceholderCe")
            }
            type="text"
            {...register("dni")}
          />
          {errors.dni && <span className="mt-1 block text-error text-xs">{errors.dni.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="col-phoneNumber">
            {t("components.colKycForm.phoneNumber")}
          </label>
          <div className={`flex items-center rounded-lg border ${errors.phoneNumber ? "border-error" : "border-neutral-300"}`}>
            <span className="select-none border-r border-neutral-300 px-3 py-2 text-base text-gray-500">+</span>
            <input
              autoComplete="tel"
              className="input-vortex-primary input-ghost w-full rounded-r-lg p-2 text-base"
              id="col-phoneNumber"
              inputMode="tel"
              placeholder="573000000000"
              type="tel"
              {...register("phoneNumber", {
                setValueAs: (v: string) => (v ? `+${v.replace(/^\+/, "").replace(/\D/g, "")}` : v)
              })}
            />
          </div>
          {errors.phoneNumber && <span className="mt-1 block text-error text-xs">{errors.phoneNumber.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="col-address">
            {t("components.mxnKycForm.address")}
          </label>
          <input
            autoComplete="street-address"
            className={inputClass(!!errors.address)}
            id="col-address"
            type="text"
            {...register("address")}
          />
          {errors.address && <span className="mt-1 block text-error text-xs">{errors.address.message}</span>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm" htmlFor="col-city">
              {t("components.mxnKycForm.city")}
            </label>
            <input
              autoComplete="address-level2"
              className={inputClass(!!errors.city)}
              id="col-city"
              type="text"
              {...register("city")}
            />
            {errors.city && <span className="mt-1 block text-error text-xs">{errors.city.message}</span>}
          </div>

          <div>
            <label className="mb-1 block text-sm" htmlFor="col-state">
              {t("components.mxnKycForm.state")}
            </label>
            <input
              autoComplete="address-level1"
              className={inputClass(!!errors.state)}
              id="col-state"
              type="text"
              {...register("state")}
            />
            {errors.state && <span className="mt-1 block text-error text-xs">{errors.state.message}</span>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="col-zipCode">
            {t("components.mxnKycForm.zipCode")}
          </label>
          <input
            autoComplete="postal-code"
            className={inputClass(!!errors.zipCode)}
            id="col-zipCode"
            inputMode="numeric"
            type="text"
            {...register("zipCode")}
          />
          {errors.zipCode && <span className="mt-1 block text-error text-xs">{errors.zipCode.message}</span>}
        </div>

        <button className="btn btn-vortex-primary mt-2 w-full" type="submit">
          {t("components.mxnKycForm.continue")}
        </button>
      </form>
    </div>
  );
}
