import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { KybFormData } from "../../machines/alfredpayKyc.machine";
import { MenuButtons } from "../MenuButtons";

const schema = z.object({
  address: z.string().min(1),
  businessName: z.string().min(1),
  city: z.string().min(1),
  repDateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  repDni: z.string().optional(),
  repEmail: z.string().email(),
  repFirstName: z.string().min(1),
  repLastName: z.string().min(1),
  repNationality: z.string().length(2, "Enter a 2-letter country code"),
  state: z.string().min(1),
  taxId: z.string().min(1),
  website: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  zipCode: z.string().min(1)
});

type KybFormFields = z.infer<typeof schema>;

interface KybFormScreenProps {
  onSubmit: (data: KybFormData) => void;
}

export function KybFormScreen({ onSubmit }: KybFormScreenProps) {
  const { t } = useTranslation();

  const {
    formState: { errors },
    handleSubmit,
    register
  } = useForm<KybFormFields>({ resolver: zodResolver(schema) });

  const inputClass = (hasError: boolean) =>
    `input-vortex-primary input-ghost w-full rounded-lg border p-2 text-base ${hasError ? "border-error" : "border-neutral-300"}`;

  const handleFormSubmit = (fields: KybFormFields) => {
    onSubmit({
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
      website: fields.website || undefined,
      zipCode: fields.zipCode
    });
  };

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
            className={inputClass(!!errors.repEmail)}
            id="kyb-repEmail"
            inputMode="email"
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
              placeholder="MX"
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

        <button className="btn btn-vortex-primary mt-2 w-full" type="submit">
          {t("components.mxnKycForm.continue")}
        </button>
      </form>
    </div>
  );
}
