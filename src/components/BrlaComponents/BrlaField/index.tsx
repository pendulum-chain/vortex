import { FC } from 'react';
import { useFormContext, useFormState } from 'react-hook-form';
import { motion } from 'motion/react';

import { Field, FieldProps } from '../../Field';

export enum StandardBrlaFieldOptions {
  TAX_ID = 'taxId',
  PIX_ID = 'pixId',
}

export enum ExtendedBrlaFieldOptions {
  PHONE = 'phone',
  ADDRESS = 'address',
  CEP = 'cep',
  CITY = 'city',
  STATE = 'state',
  STREET = 'street',
  NUMBER = 'number',
  DISTRICT = 'district',
  FULL_NAME = 'fullName',
  CPF = 'cpf',
  BIRTHDATE = 'birthdate',
  EMAIL = 'email',
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

export const BrlaField: FC<BrlaFieldProps> = ({ id, label, index, validationPattern, ...rest }) => {
  // It required to be inside a FormProvider (react-hook-form)
  const { register } = useFormContext();
  const { errors } = useFormState();
  const errorMessage = errors[id]?.message as string;

  return (
    <motion.div
      className="mb-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{
        duration: 0.4,
        delay: index * 0.15,
        type: 'spring',
        stiffness: 300,
        damping: 15,
      }}
    >
      <label htmlFor={id} className="block mb-1">
        {label}
      </label>
      <Field
        id={id}
        register={register(id, { required: true, pattern: validationPattern })}
        className={`w-full p-2 ${errors[id] ? 'border border-red-500' : ''}`}
        {...rest}
      />
      {errorMessage && <span className="text-red-500 text-sm mt-1">{errorMessage}</span>}
    </motion.div>
  );
};
