import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { motion } from "motion/react";
import { FC } from "react";
import { useFormContext, useFormState } from "react-hook-form";

import { cn } from "../../../helpers/cn";
import { Field, FieldProps } from "../../Field";

export enum StandardAveniaFieldOptions {
  TAX_ID = "taxId",
  PIX_ID = "pixId",
  WALLET_ADDRESS = "walletAddress"
}

export enum ExtendedAveniaFieldOptions {
  PHONE = "phone",
  ADDRESS = "address",
  TAX_ID = "taxId",
  PIX_ID = "pixId",
  CEP = "cep",
  CITY = "city",
  STATE = "state",
  STREET = "street",
  NUMBER = "number",
  DISTRICT = "district",
  FULL_NAME = "fullName",
  CPF = "cpf",
  BIRTHDATE = "birthdate",
  EMAIL = "email",
  COMPANY_NAME = "companyName",
  START_DATE = "startDate",
  PARTNER_CPF = "partnerCpf"
}

export type AveniaFieldOptions = StandardAveniaFieldOptions | ExtendedAveniaFieldOptions;

export interface AveniaFieldProps extends FieldProps {
  id: AveniaFieldOptions;
  label: string;
  index: number;
  placeholder?: string;
  options?: string[];
}

export const AveniaField: FC<AveniaFieldProps> = ({ id, label, index, className, ...rest }) => {
  // It required to be inside a FormProvider (react-hook-form)
  const { register } = useFormContext();
  const { errors } = useFormState();
  const errorMessage = errors[id]?.message as string;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      exit={{ opacity: 0, y: -20 }}
      initial={{ opacity: 0, y: 20 }}
      transition={{
        delay: index * 0.05,
        duration: 0.15,
        ease: "easeOut"
      }}
    >
      <label className="mb-1 block" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <Field className={cn("w-full p-2", errors[id] && "border border-red-800")} id={id} register={register(id)} {...rest} />
        {id === ExtendedAveniaFieldOptions.BIRTHDATE && (
          <CalendarDaysIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 h-5 w-5 text-gray-600" />
        )}
      </div>
      {errorMessage && <span className="mt-1 text-red-800 text-sm">{errorMessage}</span>}
    </motion.div>
  );
};
