import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { MxnKycFormData } from "../../machines/alfredpayKyc.machine";
import { MenuButtons } from "../MenuButtons";

const schema = z.object({
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

interface MxnKycFormScreenProps {
  onSubmit: (data: MxnKycFormData) => void;
}

export function MxnKycFormScreen({ onSubmit }: MxnKycFormScreenProps) {
  const { t } = useTranslation();

  const {
    formState: { errors },
    handleSubmit,
    register
  } = useForm<MxnKycFormData>({ resolver: zodResolver(schema) });

  const inputClass = (hasError: boolean) =>
    `input-vortex-primary input-ghost w-full rounded-lg border p-2 text-base ${hasError ? "border-error" : "border-neutral-300"}`;

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      <h1 className="mt-4 mb-2 text-center font-bold text-2xl text-primary">{t("components.mxnKycForm.title")}</h1>
      <p className="mb-4 text-center text-gray-500 text-sm">{t("components.mxnKycForm.subtitle")}</p>

      <form className="flex grow-1 flex-col space-y-3 overflow-y-auto px-1 pb-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm" htmlFor="firstName">
              {t("components.mxnKycForm.firstName")}
            </label>
            <input
              autoComplete="given-name"
              className={inputClass(!!errors.firstName)}
              id="firstName"
              type="text"
              {...register("firstName")}
            />
            {errors.firstName && <span className="mt-1 block text-error text-xs">{errors.firstName.message}</span>}
          </div>

          <div>
            <label className="mb-1 block text-sm" htmlFor="lastName">
              {t("components.mxnKycForm.lastName")}
            </label>
            <input
              autoComplete="family-name"
              className={inputClass(!!errors.lastName)}
              id="lastName"
              type="text"
              {...register("lastName")}
            />
            {errors.lastName && <span className="mt-1 block text-error text-xs">{errors.lastName.message}</span>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="dateOfBirth">
            {t("components.mxnKycForm.dateOfBirth")}
          </label>
          <input
            className={inputClass(!!errors.dateOfBirth)}
            id="dateOfBirth"
            placeholder="YYYY-MM-DD"
            type="date"
            {...register("dateOfBirth")}
          />
          {errors.dateOfBirth && <span className="mt-1 block text-error text-xs">{errors.dateOfBirth.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="email">
            {t("components.mxnKycForm.email")}
          </label>
          <input
            autoComplete="email"
            className={inputClass(!!errors.email)}
            id="email"
            inputMode="email"
            type="email"
            {...register("email")}
          />
          {errors.email && <span className="mt-1 block text-error text-xs">{errors.email.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="dni">
            {t("components.mxnKycForm.dni")}
          </label>
          <input
            className={inputClass(!!errors.dni)}
            id="dni"
            placeholder="CURP / INE number"
            type="text"
            {...register("dni")}
          />
          {errors.dni && <span className="mt-1 block text-error text-xs">{errors.dni.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="address">
            {t("components.mxnKycForm.address")}
          </label>
          <input
            autoComplete="street-address"
            className={inputClass(!!errors.address)}
            id="address"
            type="text"
            {...register("address")}
          />
          {errors.address && <span className="mt-1 block text-error text-xs">{errors.address.message}</span>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm" htmlFor="city">
              {t("components.mxnKycForm.city")}
            </label>
            <input
              autoComplete="address-level2"
              className={inputClass(!!errors.city)}
              id="city"
              type="text"
              {...register("city")}
            />
            {errors.city && <span className="mt-1 block text-error text-xs">{errors.city.message}</span>}
          </div>

          <div>
            <label className="mb-1 block text-sm" htmlFor="state">
              {t("components.mxnKycForm.state")}
            </label>
            <input
              autoComplete="address-level1"
              className={inputClass(!!errors.state)}
              id="state"
              type="text"
              {...register("state")}
            />
            {errors.state && <span className="mt-1 block text-error text-xs">{errors.state.message}</span>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="zipCode">
            {t("components.mxnKycForm.zipCode")}
          </label>
          <input
            autoComplete="postal-code"
            className={inputClass(!!errors.zipCode)}
            id="zipCode"
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
