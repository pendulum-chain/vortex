import { motion } from "motion/react";
import { FC } from "react";
import { useFormContext, useFormState } from "react-hook-form";

import { cn } from "../../../helpers/cn";
import { Field, FieldProps } from "../../Field";

export enum StandardBrlaFieldOptions {
  TAX_ID = "taxId",
  PIX_ID = "pixId",
  WALLET_ADDRESS = "walletAddress"
}

export enum ExtendedBrlaFieldOptions {
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

export type BrlaFieldOptions = StandardBrlaFieldOptions | ExtendedBrlaFieldOptions;

export interface BrlaFieldProps extends FieldProps {
  id: BrlaFieldOptions;
  label: string;
  index: number;
  placeholder?: string;
  validationPattern?: {
    value: RegExp;
    message: string;
  };
}

export const BrlaField: FC<BrlaFieldProps> = ({ id, label, index, validationPattern, className, ...rest }) => {
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
        damping: 15,
        delay: index * 0.15,
        duration: 0.4,
        stiffness: 300,
        type: "spring"
      }}
    >
      <label className="mb-1 block" htmlFor={id}>
        {label}
      </label>
      <Field
        className={cn("w-full p-2", errors[id] && "border border-red-500")}
        id={id}
        register={register(id, { pattern: validationPattern, required: true })}
        {...rest}
      />
      {errorMessage && <span className="mt-1 text-red-500 text-sm">{errorMessage}</span>}
    </motion.div>
  );
};
