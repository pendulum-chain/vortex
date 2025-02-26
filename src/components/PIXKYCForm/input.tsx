import { FC } from 'react';
import { UseFormReturn, useFormState } from 'react-hook-form';
import { AnimatePresence, motion } from 'motion/react';
import { SwapFormValues } from '../Nabla/schema';
import { OutputTokenType } from '../../constants/tokenConfig';

enum CurrencyType {
  BRL = 'brl',
}

enum FormFieldOptions {
  TAX_ID = 'taxId',
  PIX_ID = 'pixId',
}

interface FormFieldProps {
  id: FormFieldOptions;
  label: string;
  index: number;
  form: UseFormReturn<SwapFormValues>;
}

interface BrlaInputProps {
  form: UseFormReturn<SwapFormValues>;
  toToken: OutputTokenType;
}

const FormField = ({ id, label, index, form }: FormFieldProps) => {
  const { register } = form;
  const { errors } = useFormState({ control: form.control });

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
      <input
        id={id}
        {...register(id, { required: true })}
        className={`w-full p-2 rounded ${errors[id] ? 'border border-red-500' : ''}`}
        placeholder=""
      />
    </motion.div>
  );
};

export const BrlaInput: FC<BrlaInputProps> = ({ form, toToken }) => {
  const containerAnimation = {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto' },
    exit: { opacity: 0, height: 0 },
    transition: { duration: 0.3 },
  };

  return (
    <AnimatePresence>
      {toToken === CurrencyType.BRL && (
        <motion.div {...containerAnimation}>
          <motion.h2
            className="mb-2 text-2xl font-bold text-center text-blue-700"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              delay: 0.1,
              type: 'spring',
              stiffness: 300,
              damping: 15,
            }}
          >
            PIX Details
          </motion.h2>
          <motion.p
            className="text-gray-400 mb-4"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              delay: 0.2,
              type: 'spring',
              stiffness: 300,
              damping: 15,
            }}
          >
            Which bank account should we send the funds to?
          </motion.p>
          <FormField id={FormFieldOptions.TAX_ID} label="Tax ID" index={0} form={form} />
          <FormField id={FormFieldOptions.PIX_ID} label="PIX ID" index={1} form={form} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
