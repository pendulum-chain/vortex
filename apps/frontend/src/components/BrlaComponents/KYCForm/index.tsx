import { motion } from "motion/react";
import { FormProvider, UseFormReturn } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";

import { KYCFormData } from "../../../hooks/brla/useKYCForm";
import { useMaintenanceAwareButton } from "../../../hooks/useMaintenanceAware";
import { BrlaField, BrlaFieldProps, ExtendedBrlaFieldOptions } from "../BrlaField";
interface KYCFormProps {
  fields: BrlaFieldProps[];
  form: UseFormReturn<KYCFormData>;
  onSubmit: (formData: KYCFormData) => Promise<void>;
  onBackClick: () => void;
}

export const KYCForm = ({ form, onSubmit, onBackClick, fields }: KYCFormProps) => {
  const { handleSubmit } = form;
  const { t } = useTranslation();
  const { buttonProps, isMaintenanceDisabled } = useMaintenanceAwareButton();

  return (
    <FormProvider {...form}>
      <motion.form
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="mx-4 mt-8 mb-4 min-h-[480px] rounded-lg px-4 pt-4 pb-2 shadow-custom md:mx-auto md:w-96"
        onSubmit={handleSubmit(onSubmit)}
      >
        <h1 className="mt-2 mb-4 text-center font-bold text-3xl text-blue-700">{t("components.brlaKYCForm.title")}</h1>
        <div className="grid grid-cols-2 gap-4">
          {fields.map(field => (
            <BrlaField
              key={field.id}
              className={
                [
                  ExtendedBrlaFieldOptions.TAX_ID,
                  ExtendedBrlaFieldOptions.PHONE,
                  ExtendedBrlaFieldOptions.FULL_NAME,
                  ExtendedBrlaFieldOptions.BIRTHDATE,
                  ExtendedBrlaFieldOptions.COMPANY_NAME
                ].includes(field.id as ExtendedBrlaFieldOptions)
                  ? "col-span-2"
                  : ""
              }
              {...field}
            />
          ))}
        </div>
        <div className="mt-4 text-center text-primary-500">
          <Trans
            i18nKey="components.brlaKYCForm.description"
            components={{
              a: <a className="underline" target="_blank" rel="noreferrer" href="https://www.brla.digital" />
            }}
          >
            Complete these quick identity checks (typically 90 seconds). Data is processed securely by{" "}
            <a className="underline" target="_blank" rel="noreferrer" href="https://www.brla.digital">
              BRLA
            </a>{" "}
            using bank-grade encryption for transaction security.
          </Trans>
        </div>
        <div className="mt-8 mb-8 grid gap-3">
          <div className="flex gap-3">
            <button type="button" className="btn-vortex-primary-inverse btn flex-1" onClick={onBackClick}>
              {t("components.brlaKYCForm.buttons.back")}
            </button>
            <button type="submit" className="btn-vortex-primary btn flex-1" {...buttonProps}>
              {isMaintenanceDisabled ? buttonProps.title : t("components.brlaKYCForm.buttons.finish")}
            </button>
          </div>
        </div>
      </motion.form>
    </FormProvider>
  );
};
