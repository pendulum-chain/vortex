import { zodResolver } from "@hookform/resolvers/zod";
import { type KybFormData, type KybFormValues, kybFormSchema, mapKybFormValues, toKybFormValues } from "@vortexfi/kyc";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { MenuButtons } from "../MenuButtons";

interface KybFormScreenProps {
  onSubmit: (data: KybFormData) => void;
  country: string;
  /** Details already given, so stepping back from the questionnaire does not blank the form. */
  defaults?: KybFormData;
  userEmail?: string;
}

export function KybFormScreen({ onSubmit, country, defaults, userEmail }: KybFormScreenProps) {
  const { t } = useTranslation();

  const {
    formState: { errors },
    handleSubmit,
    register
  } = useForm<KybFormValues>({
    defaultValues: defaults ? toKybFormValues(defaults) : { repEmail: userEmail ?? "", repPep: false },
    resolver: zodResolver(kybFormSchema)
  });

  const inputClass = (hasError: boolean) =>
    `input-vortex-primary input-ghost w-full rounded-lg border p-2 text-base ${hasError ? "border-error" : "border-neutral-300"}`;

  const handleFormSubmit = (fields: KybFormValues) => onSubmit(mapKybFormValues(fields));

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      <h1 className="mt-4 mb-2 text-center font-bold text-2xl text-primary">{t("components.kybForm.title")}</h1>
      <p className="mb-4 text-center text-gray-500 text-sm">{t("components.kybForm.subtitle")}</p>

      <form className="flex grow-1 flex-col space-y-3 overflow-y-auto px-1 pb-4" onSubmit={handleSubmit(handleFormSubmit)}>
        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-businessName">
            {t("components.kybForm.businessName")}
          </label>
          <input
            autoComplete="organization"
            className={inputClass(!!errors.businessName)}
            id="kyb-businessName"
            type="text"
            {...register("businessName")}
          />
          {errors.businessName && <span className="mt-1 block text-error text-xs">{errors.businessName.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-taxId">
            {t("components.kybForm.taxId")}
          </label>
          <input className={inputClass(!!errors.taxId)} id="kyb-taxId" type="text" {...register("taxId")} />
          {errors.taxId && <span className="mt-1 block text-error text-xs">{errors.taxId.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-website">
            {t("components.kybForm.website")}
          </label>
          <input
            className={inputClass(!!errors.website)}
            id="kyb-website"
            placeholder="https://"
            type="url"
            {...register("website")}
          />
          {errors.website && <span className="mt-1 block text-error text-xs">{errors.website.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-address">
            {t("components.mxnKycForm.address")}
          </label>
          <input
            autoComplete="street-address"
            className={inputClass(!!errors.address)}
            id="kyb-address"
            type="text"
            {...register("address")}
          />
          {errors.address && <span className="mt-1 block text-error text-xs">{errors.address.message}</span>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm" htmlFor="kyb-city">
              {t("components.mxnKycForm.city")}
            </label>
            <input
              autoComplete="address-level2"
              className={inputClass(!!errors.city)}
              id="kyb-city"
              type="text"
              {...register("city")}
            />
            {errors.city && <span className="mt-1 block text-error text-xs">{errors.city.message}</span>}
          </div>
          <div>
            <label className="mb-1 block text-sm" htmlFor="kyb-state">
              {t("components.mxnKycForm.state")}
            </label>
            <input
              autoComplete="address-level1"
              className={inputClass(!!errors.state)}
              id="kyb-state"
              type="text"
              {...register("state")}
            />
            {errors.state && <span className="mt-1 block text-error text-xs">{errors.state.message}</span>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-zipCode">
            {t("components.mxnKycForm.zipCode")}
          </label>
          <input
            autoComplete="postal-code"
            className={inputClass(!!errors.zipCode)}
            id="kyb-zipCode"
            inputMode="numeric"
            type="text"
            {...register("zipCode")}
          />
          {errors.zipCode && <span className="mt-1 block text-error text-xs">{errors.zipCode.message}</span>}
        </div>

        <p className="border-neutral-200 border-t pt-3 font-semibold text-primary text-sm">
          {t("components.kybForm.representativeTitle")}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm" htmlFor="kyb-repFirstName">
              {t("components.mxnKycForm.firstName")}
            </label>
            <input
              autoComplete="given-name"
              className={inputClass(!!errors.repFirstName)}
              id="kyb-repFirstName"
              type="text"
              {...register("repFirstName")}
            />
            {errors.repFirstName && <span className="mt-1 block text-error text-xs">{errors.repFirstName.message}</span>}
          </div>
          <div>
            <label className="mb-1 block text-sm" htmlFor="kyb-repLastName">
              {t("components.mxnKycForm.lastName")}
            </label>
            <input
              autoComplete="family-name"
              className={inputClass(!!errors.repLastName)}
              id="kyb-repLastName"
              type="text"
              {...register("repLastName")}
            />
            {errors.repLastName && <span className="mt-1 block text-error text-xs">{errors.repLastName.message}</span>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-repEmail">
            {t("components.mxnKycForm.email")}
          </label>
          <input
            autoComplete="email"
            className={`${inputClass(!!errors.repEmail)} ${userEmail ? "cursor-not-allowed bg-base-200 text-gray-500" : ""}`}
            id="kyb-repEmail"
            inputMode="email"
            readOnly={!!userEmail}
            type="email"
            {...register("repEmail")}
          />
          {errors.repEmail && <span className="mt-1 block text-error text-xs">{errors.repEmail.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-repDateOfBirth">
            {t("components.mxnKycForm.dateOfBirth")}
          </label>
          <input
            className={inputClass(!!errors.repDateOfBirth)}
            id="kyb-repDateOfBirth"
            placeholder="YYYY-MM-DD"
            type="date"
            {...register("repDateOfBirth")}
          />
          {errors.repDateOfBirth && <span className="mt-1 block text-error text-xs">{errors.repDateOfBirth.message}</span>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm" htmlFor="kyb-repNationality">
              {t("components.kybForm.nationality")}
            </label>
            <input
              className={inputClass(!!errors.repNationality)}
              id="kyb-repNationality"
              maxLength={2}
              placeholder={country}
              type="text"
              {...register("repNationality", { setValueAs: v => v.toUpperCase() })}
            />
            {errors.repNationality && <span className="mt-1 block text-error text-xs">{errors.repNationality.message}</span>}
          </div>
          <div>
            <label className="mb-1 block text-sm" htmlFor="kyb-repDni">
              {t("components.kybForm.repDni")}
            </label>
            <input className={inputClass(!!errors.repDni)} id="kyb-repDni" type="text" {...register("repDni")} />
            {errors.repDni && <span className="mt-1 block text-error text-xs">{errors.repDni.message}</span>}
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm" htmlFor="kyb-repPep">
          <input className="checkbox mt-0.5" id="kyb-repPep" type="checkbox" {...register("repPep")} />
          <span>{t("components.kybForm.repPep")}</span>
        </label>

        <button className="btn btn-vortex-primary mt-2 w-full" type="submit">
          {t("components.mxnKycForm.continue")}
        </button>
      </form>
    </div>
  );
}
