import { FieldValues, FormProvider, SubmitHandler, UseFormReturn } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";

import { useMaintenanceAwareButton } from "../../../hooks/useMaintenanceAware";

import { StepFooter } from "../../StepFooter";
import { AveniaField, AveniaFieldProps, ExtendedAveniaFieldOptions } from "../AveniaField";

interface AveniaVerificationFormProps<T extends FieldValues> {
  fields: AveniaFieldProps[];
  form: UseFormReturn<T>;
  onSubmit: SubmitHandler<T>;
  isCompany?: boolean;
}

export const AveniaVerificationForm = <T extends FieldValues>({
  form,
  fields,
  onSubmit,
  isCompany = false
}: AveniaVerificationFormProps<T>) => {
  const { handleSubmit } = form;
  const { t } = useTranslation();
  const { buttonProps, isMaintenanceDisabled } = useMaintenanceAwareButton();

  // formState.isValid is not working as expected, so we need to check the errors
  const isFormInvalid = Object.keys(form.formState.errors).length > 0 || !form.formState.isDirty || form.formState.isSubmitting;

  return (
    <FormProvider {...form}>
      <form className="mt-8 mb-4 flex w-full flex-col" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex-1 pb-36">
          <h1 className="mt-2 mb-4 text-center font-bold text-3xl text-primary">
            {isCompany ? t("components.aveniaKYB.title.default") : t("components.aveniaKYC.title")}
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
            <div className="my-4 text-balance text-primary-500 text-sm">
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
        </div>
        <StepFooter>
          <button
            className="btn-vortex-primary btn w-full"
            disabled={isMaintenanceDisabled || buttonProps.disabled || isFormInvalid}
            title={buttonProps.title}
            type="submit"
          >
            {isMaintenanceDisabled
              ? buttonProps.title
              : isCompany
                ? t("components.aveniaKYB.buttons.next")
                : t("components.aveniaKYC.buttons.next")}
          </button>
        </StepFooter>
      </form>
    </FormProvider>
  );
};
