import { AnimatePresence, motion } from "motion/react";
import { useFormContext, useFormState } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { cn } from "../../../helpers/cn";
import { Field } from "../../Field";

export interface BrazilDetailsFormProps {
  className?: string;
  isWalletAddressDisabled?: boolean;
}

export const MoneriumFormStep = ({ className, isWalletAddressDisabled }: BrazilDetailsFormProps) => {
  const { t } = useTranslation();

  const id = "walletAddress";

  // It required to be inside a FormProvider (react-hook-form)
  const { register } = useFormContext();
  const { errors } = useFormState();
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
          <label className="mb-1 block" htmlFor={id}>
            Wallet Address
          </label>
          <Field
            className={cn("w-full p-2", errors[id] && "border border-red-500")}
            id={id}
            register={register(id, {
              pattern: {
                message: "Invalid wallet address",
                value: /^0x[a-fA-F0-9]{40}$/ // FIXME
              },
              required: true
            })}
          />
          {errorMessage && <span className="mt-1 text-red-500 text-sm">{errorMessage}</span>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
