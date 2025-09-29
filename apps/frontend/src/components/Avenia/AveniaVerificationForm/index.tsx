import { motion } from "motion/react";
import { FormProvider, UseFormReturn } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";

import { KYCFormData } from "../../../hooks/brla/useKYCForm";
import { useMaintenanceAwareButton } from "../../../hooks/useMaintenanceAware";
import { AveniaKycActorRef } from "../../../machines/types";
import { AveniaField, AveniaFieldProps, ExtendedAveniaFieldOptions } from "../AveniaField";

interface AveniaVerificationFormProps {
  fields: AveniaFieldProps[];
  form: UseFormReturn<KYCFormData>;
  aveniaKycActor: AveniaKycActorRef;
  isCompany?: boolean;
}

export const AveniaVerificationForm = ({ form, fields, aveniaKycActor, isCompany = false }: AveniaVerificationFormProps) => {
  const { handleSubmit } = form;
  const { t } = useTranslation();
  const { buttonProps, isMaintenanceDisabled } = useMaintenanceAwareButton();

  const onSubmit = () => {
    const formData = form.getValues();
    aveniaKycActor.send({ formData, type: "FORM_SUBMIT" });
  };

  return (
    <FormProvider {...form}>
      <motion.form
        animate={{ opacity: 1, scale: 1 }}
        className="mt-8 mb-4 min-h-[480px] w-full"
        initial={{ opacity: 0, scale: 0.9 }}
        onSubmit={handleSubmit(onSubmit)}
        transition={{ duration: 0.3 }}
      >
        <h1 className="mt-2 mb-4 text-center font-bold text-3xl text-blue-700">
          {isCompany ? t("components.aveniaKYB.title") : t("components.aveniaKYC.title")}
        </h1>
        <div className="grid grid-cols-2 gap-4">
          {fields.map(field => (
            <AveniaField
              className={
                [
                  ExtendedAveniaFieldOptions.PIX_ID,
                  ExtendedAveniaFieldOptions.TAX_ID,
                  ExtendedAveniaFieldOptions.FULL_NAME,
                  ExtendedAveniaFieldOptions.COMPANY_NAME
                ].includes(field.id as ExtendedAveniaFieldOptions)
                  ? "col-span-2"
                  : ""
              }
              key={field.id}
              {...field}
            />
          ))}
        </div>
        {!isCompany && (
          <div className="mt-4 text-center text-primary-500">
            <Trans
              components={{
                a: <a className="underline" href="https://www.avenia.io" rel="noreferrer" target="_blank" />
              }}
              i18nKey={"components.aveniaKYC.description"}
            >
              Complete these quick identity checks (typically 90 seconds). Data is processed securely by{" "}
              <a className="underline" href="https://www.avenia.io" rel="noreferrer" target="_blank">
                Avenia
              </a>{" "}
              using bank-grade encryption for transaction security.
            </Trans>
          </div>
        )}
        <div className="mt-8 mb-8 grid gap-3">
          <div className="flex gap-3">
            <button
              className="btn-vortex-primary-inverse btn flex-1"
              onClick={() => aveniaKycActor.send({ type: "CANCEL" })}
              type="button"
            >
              {isCompany ? t("components.aveniaKYB.buttons.cancel") : t("components.aveniaKYC.buttons.back")}
            </button>
            <button
              className="btn-vortex-primary btn flex-1"
              disabled={isMaintenanceDisabled || buttonProps.disabled}
              onClick={() => {
                const formData = form.getValues();
                aveniaKycActor.send({ formData, type: "FORM_SUBMIT" });
              }}
              title={buttonProps.title}
              type="button"
            >
              {isMaintenanceDisabled
                ? buttonProps.title
                : isCompany
                  ? t("components.aveniaKYB.buttons.next")
                  : t("components.aveniaKYC.buttons.next")}
            </button>
          </div>
        </div>
      </motion.form>
    </FormProvider>
  );
};
