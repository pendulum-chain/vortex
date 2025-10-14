import { AnimatePresence, motion } from "motion/react";
import { useFormContext, useFormState } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { cn } from "../../../helpers/cn";
import { Field } from "../../Field";

export interface MoneriumFormStepProps {
  className?: string;
}

export const MoneriumAssethubFormStep = ({ className }: MoneriumFormStepProps) => {
  const { t } = useTranslation();

  // This component is required to be inside a FormProvider (react-hook-form)
  const { register } = useFormContext();
  const { errors } = useFormState();

  // This name has to match the field in the form data
  const id = "walletAddress";
  const errorMessage = errors[id]?.message as string;

  return (
    <div className={cn("mx-auto flex h-full w-full flex-col justify-center", className)}>
      <AnimatePresence>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className={className}
          exit={{ opacity: 0, y: -20 }}
          initial={{ opacity: 0, y: 20 }}
          transition={{
            damping: 15,
            delay: 0.15,
            duration: 0.4,
            stiffness: 300,
            type: "spring"
          }}
        >
          <div>
            <p className="mb-4 text-gray-600 text-sm">{t("components.moneriumFormStep.description.1")}</p>
          </div>
          <label className="mb-1 block" htmlFor={id}>
            {t("components.moneriumFormStep.field.label")}
          </label>
          <Field
            className={cn("w-full p-2", errors[id] && "border border-red-500")}
            id={id}
            register={register(id, {
              required: t("components.swap.validation.walletAddress.required")
            })}
          />
          {errorMessage && <span className="mt-1 text-red-500 text-sm">{errorMessage}</span>}
          <p className="mt-6 mb-4 text-gray-600 text-sm">
            <Trans
              components={{
                a: <a className="underline" href="https://www.monerium.com" rel="noreferrer" target="_blank" />
              }}
              i18nKey={"components.moneriumFormStep.description.2"}
            >
              Then, authenticate with our stablecoin partner
              <a className="underline" href="https://www.monerium.com" rel="noreferrer" target="_blank">
                Monerium
              </a>{" "}
              by connecting your EVM wallet.
            </Trans>
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
