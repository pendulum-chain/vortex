import { RefObject, useCallback } from 'react';
import { motion } from 'motion/react';
import { FormProvider, UseFormReturn } from 'react-hook-form';

import { FeeComparisonRef } from '../../FeeComparison';
import { BrlaField, BrlaFieldProps, ExtendedBrlaFieldOptions } from '../BrlaField';

interface KYCFormProps<T extends Record<string, string>> {
  fields: BrlaFieldProps[];
  form: UseFormReturn<T>;
  onSubmit: (formData: Record<ExtendedBrlaFieldOptions, string>) => Promise<void>;
  onBackClick: () => void;
  feeComparisonRef: RefObject<FeeComparisonRef | null>;
}

export const KYCForm = <T extends Record<string, string>>({
  form,
  onSubmit,
  onBackClick,
  fields,
  feeComparisonRef,
}: KYCFormProps<T>) => {
  const { handleSubmit } = form;

  const compareFeesClick = useCallback(() => {
    feeComparisonRef.current?.scrollIntoView();
  }, [feeComparisonRef]);

  return (
    <FormProvider {...form}>
      <motion.form
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96 min-h-[480px] flex flex-col"
        onSubmit={handleSubmit(onSubmit)}
      >
        <h1 className="mt-2 mb-5 text-3xl font-bold text-center text-blue-700">KYC Details</h1>
        {fields.map((field) => (
          <BrlaField key={field.id} {...field} />
        ))}

        <div className="grid gap-3 mt-8 mb-12">
          <div className="flex gap-3">
            <button type="button" className="btn-vortex-primary-inverse btn flex-1" onClick={onBackClick}>
              Back
            </button>
            <button type="submit" className="btn-vortex-primary btn flex-1">
              Continue
            </button>
          </div>
          <button type="button" className="btn-vortex-primary-inverse btn flex-1" onClick={compareFeesClick}>
            Compare Fees
          </button>
        </div>
      </motion.form>
    </FormProvider>
  );
};
