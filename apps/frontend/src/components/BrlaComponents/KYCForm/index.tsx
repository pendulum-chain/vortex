import { motion } from "motion/react";
import { FormProvider, UseFormReturn } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";

import { KYCFormData } from "../../../hooks/brla/useKYCForm";
import { useMaintenanceAwareButton } from "../../../hooks/useMaintenanceAware";
import { AveniaKycActorRef } from "../../../machines/types";
import { BrlaField, BrlaFieldProps, ExtendedBrlaFieldOptions } from "../BrlaField";

interface KYCFormProps {
  fields: BrlaFieldProps[];
  form: UseFormReturn<KYCFormData>;
  aveniaKycActor: AveniaKycActorRef;
}

export const KYCForm = ({ form, fields, aveniaKycActor }: KYCFormProps) => {
  const { handleSubmit } = form;
  const { t } = useTranslation();
  const { buttonProps, isMaintenanceDisabled } = useMaintenanceAwareButton();

  return (
    <FormProvider {...form}>
      <motion.form
        animate={{ opacity: 1, scale: 1 }}
        className="w-full mt-8 mb-4 min-h-[480px]"
        initial={{ opacity: 0, scale: 0.9 }}
        onSubmit={handleSubmit(() => aveniaKycActor.send({ formData: form.getValues(), type: "FORM_SUBMIT" }))}
        transition={{ duration: 0.3 }}
      >
        <h1 className="mt-2 mb-4 text-center font-bold text-3xl text-blue-700">{t("components.brlaKYCForm.title")}</h1>
        <div className="grid grid-cols-2 gap-4">
          {fields.map(field => (
            <BrlaField
              className={
                [
                  ExtendedBrlaFieldOptions.PIX_ID,
                  ExtendedBrlaFieldOptions.TAX_ID,
                  ExtendedBrlaFieldOptions.FULL_NAME,
                  ExtendedBrlaFieldOptions.COMPANY_NAME
                ].includes(field.id as ExtendedBrlaFieldOptions)
                  ? "col-span-2"
                  : ""
              }
              key={field.id}
              {...field}
            />
          ))}
        </div>
        <div className="mt-4 text-center text-primary-500">
          <Trans
            components={{
              a: <a className="underline" href="https://www.brla.digital" rel="noreferrer" target="_blank" />
            }}
            i18nKey="components.brlaKYCForm.description"
          >
            Complete these quick identity checks (typically 90 seconds). Data is processed securely by{" "}
            <a className="underline" href="https://www.brla.digital" rel="noreferrer" target="_blank">
              BRLA
            </a>{" "}
            using bank-grade encryption for transaction security.
          </Trans>
        </div>
        <div className="mt-8 mb-8 grid gap-3">
          <div className="flex gap-3">
            <button
              className="btn-vortex-primary-inverse btn flex-1"
              onClick={() => aveniaKycActor.send({ type: "CANCEL" })}
              type="button"
            >
              {t("components.brlaKYCForm.buttons.back")}
            </button>
            <button className="btn-vortex-primary btn flex-1" type="submit" {...buttonProps}>
              {isMaintenanceDisabled ? buttonProps.title : t("components.brlaKYCForm.buttons.finish")}
            </button>
          </div>
        </div>
      </motion.form>
    </FormProvider>
  );
};
