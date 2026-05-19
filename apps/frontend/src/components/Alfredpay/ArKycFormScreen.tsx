import { zodResolver } from "@hookform/resolvers/zod";
import { AlfredpayArgentinaDocumentType } from "@vortexfi/shared";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { MxnKycFormData } from "../../machines/alfredpayKyc.machine";
import { MenuButtons } from "../MenuButtons";

const schema = z
  .object({
    address: z.string().min(1),
    city: z.string().min(1),
    cuit: z.string().optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
    dni: z.string().min(1),
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    nationalities: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
    pep: z.boolean(),
    phoneNumber: z.string().regex(/^\+54[\d\s\-()]{7,}$/, "Use Argentina format (+54...)"),
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

interface ArKycFormScreenProps {
  onSubmit: (data: MxnKycFormData) => void;
}

export function ArKycFormScreen({ onSubmit }: ArKycFormScreenProps) {
  const { t } = useTranslation();

  const {
    formState: { errors },
    handleSubmit,
    register,
    watch
  } = useForm<ArKycFormValues>({
    defaultValues: {
      cuit: "",
      nationalities: ["AR"],
      pep: false,
      typeDocumentAr: AlfredpayArgentinaDocumentType.DNI
    },
    resolver: zodResolver(schema)
  });

  const documentType = watch("typeDocumentAr");

  const inputClass = (hasError: boolean) =>
    `input-vortex-primary input-ghost w-full rounded-lg border p-2 text-base ${hasError ? "border-error" : "border-neutral-300"}`;

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      <h1 className="mt-4 mb-2 text-center font-bold text-2xl text-primary">{t("components.arKycForm.title")}</h1>
      <p className="mb-4 text-center text-gray-500 text-sm">{t("components.arKycForm.subtitle")}</p>

      <form className="flex grow-1 flex-col space-y-3 overflow-y-auto px-1 pb-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm" htmlFor="ar-firstName">
              {t("components.mxnKycForm.firstName")}
            </label>
            <input
              autoComplete="given-name"
              className={inputClass(!!errors.firstName)}
              id="ar-firstName"
              type="text"
              {...register("firstName")}
            />
            {errors.firstName && <span className="mt-1 block text-error text-xs">{errors.firstName.message}</span>}
          </div>

          <div>
            <label className="mb-1 block text-sm" htmlFor="ar-lastName">
              {t("components.mxnKycForm.lastName")}
            </label>
            <input
              autoComplete="family-name"
              className={inputClass(!!errors.lastName)}
              id="ar-lastName"
              type="text"
              {...register("lastName")}
            />
            {errors.lastName && <span className="mt-1 block text-error text-xs">{errors.lastName.message}</span>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="ar-dateOfBirth">
            {t("components.mxnKycForm.dateOfBirth")}
          </label>
          <input
            className={inputClass(!!errors.dateOfBirth)}
            id="ar-dateOfBirth"
            placeholder="YYYY-MM-DD"
            type="date"
            {...register("dateOfBirth")}
          />
          {errors.dateOfBirth && <span className="mt-1 block text-error text-xs">{errors.dateOfBirth.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="ar-email">
            {t("components.mxnKycForm.email")}
          </label>
          <input
            autoComplete="email"
            className={inputClass(!!errors.email)}
            id="ar-email"
            inputMode="email"
            type="email"
            {...register("email")}
          />
          {errors.email && <span className="mt-1 block text-error text-xs">{errors.email.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="ar-phoneNumber">
            {t("components.arKycForm.phoneNumber")}
          </label>
          <input
            autoComplete="tel"
            className={inputClass(!!errors.phoneNumber)}
            id="ar-phoneNumber"
            inputMode="tel"
            placeholder="+54 9 11 1234 5678"
            type="tel"
            {...register("phoneNumber")}
          />
          {errors.phoneNumber && <span className="mt-1 block text-error text-xs">{errors.phoneNumber.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="ar-documentType">
            {t("components.arKycForm.documentType")}
          </label>
          <select
            className={`select w-full rounded-lg border bg-base-200 p-2 text-base ${errors.typeDocumentAr ? "border-error" : "border-neutral-300"}`}
            id="ar-documentType"
            {...register("typeDocumentAr")}
          >
            <option value="DNI">{t("components.arKycForm.options.dni")}</option>
          </select>
          {errors.typeDocumentAr && <span className="mt-1 block text-error text-xs">{errors.typeDocumentAr.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="ar-dni">
            {t("components.arKycForm.dni")}
          </label>
          <input
            className={inputClass(!!errors.dni)}
            id="ar-dni"
            inputMode="numeric"
            placeholder={
              documentType === AlfredpayArgentinaDocumentType.DNI ? t("components.arKycForm.dniPlaceholder") : undefined
            }
            type="text"
            {...register("dni")}
          />
          {errors.dni && <span className="mt-1 block text-error text-xs">{errors.dni.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="ar-cuit">
            {t("components.arKycForm.cuit")}
          </label>
          <input
            className={inputClass(!!errors.cuit)}
            id="ar-cuit"
            inputMode="numeric"
            placeholder={t("components.arKycForm.cuitPlaceholder")}
            type="text"
            {...register("cuit")}
          />
          {errors.cuit && <span className="mt-1 block text-error text-xs">{errors.cuit.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="ar-address">
            {t("components.mxnKycForm.address")}
          </label>
          <input
            autoComplete="street-address"
            className={inputClass(!!errors.address)}
            id="ar-address"
            type="text"
            {...register("address")}
          />
          {errors.address && <span className="mt-1 block text-error text-xs">{errors.address.message}</span>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm" htmlFor="ar-city">
              {t("components.mxnKycForm.city")}
            </label>
            <input
              autoComplete="address-level2"
              className={inputClass(!!errors.city)}
              id="ar-city"
              type="text"
              {...register("city")}
            />
            {errors.city && <span className="mt-1 block text-error text-xs">{errors.city.message}</span>}
          </div>

          <div>
            <label className="mb-1 block text-sm" htmlFor="ar-state">
              {t("components.mxnKycForm.state")}
            </label>
            <input
              autoComplete="address-level1"
              className={inputClass(!!errors.state)}
              id="ar-state"
              type="text"
              {...register("state")}
            />
            {errors.state && <span className="mt-1 block text-error text-xs">{errors.state.message}</span>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="ar-zipCode">
            {t("components.mxnKycForm.zipCode")}
          </label>
          <input
            autoComplete="postal-code"
            className={inputClass(!!errors.zipCode)}
            id="ar-zipCode"
            inputMode="numeric"
            type="text"
            {...register("zipCode")}
          />
          {errors.zipCode && <span className="mt-1 block text-error text-xs">{errors.zipCode.message}</span>}
        </div>

        <div className="flex items-center gap-2">
          <input className="checkbox checkbox-primary" id="ar-pep" type="checkbox" {...register("pep")} />
          <label className="text-sm" htmlFor="ar-pep">
            {t("components.arKycForm.pepLabel")}
          </label>
        </div>
        {errors.pep && <span className="block text-error text-xs">{errors.pep.message}</span>}

        <button className="btn btn-vortex-primary mt-2 w-full" type="submit">
          {t("components.mxnKycForm.continue")}
        </button>
      </form>
    </div>
  );
}
