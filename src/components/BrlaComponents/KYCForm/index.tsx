import { RefObject, useCallback } from 'react';
import { motion } from 'motion/react';
import { FormProvider, UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { BrlaField, BrlaFieldProps, ExtendedBrlaFieldOptions } from '../BrlaField';
import { KYCFormData } from '../../../hooks/brla/useKYCForm';

interface KYCFormProps {
  fields: BrlaFieldProps[];
  form: UseFormReturn<KYCFormData>;
  onSubmit: (formData: KYCFormData) => Promise<void>;
  onBackClick: () => void;
  feeComparisonRef: RefObject<HTMLDivElement | null>;
}

export const KYCForm = ({ form, onSubmit, onBackClick, fields, feeComparisonRef }: KYCFormProps) => {
  const { handleSubmit } = form;
  const { t } = useTranslation();

  const compareFeesClick = useCallback(() => {
    feeComparisonRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feeComparisonRef]);

  return (
    <FormProvider {...form}>
      <motion.form
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96 min-h-[480px]"
        onSubmit={handleSubmit(onSubmit)}
      >
        <h1 className="mt-2 mb-2 text-3xl font-bold text-center text-blue-700">{t('components.brlaKYCForm.title')}</h1>
        <div className="text-primary-500 text-center mb-6">
          {t('components.brlaKYCForm.description')}
          <a className="underline" target="_blank" rel="noreferrer" href="https://www.brla.digital">
            BRLA
          </a>
          .
        </div>
        <div className="grid grid-cols-2 gap-4">
          {fields.map((field) => (
            <BrlaField
              key={field.id}
              className={
                [
                  ExtendedBrlaFieldOptions.PHONE,
                  ExtendedBrlaFieldOptions.FULL_NAME,
                  ExtendedBrlaFieldOptions.BIRTHDATE,
                ].includes(field.id as ExtendedBrlaFieldOptions)
                  ? 'col-span-2'
                  : ''
              }
              {...field}
            />
          ))}
        </div>

        <div className="grid gap-3 mt-8 mb-8">
          <div className="flex gap-3">
            <button type="button" className="btn-vortex-primary-inverse btn flex-1" onClick={onBackClick}>
              {t('components.brlaKYCForm.buttons.back')}
            </button>
            <button type="submit" className="btn-vortex-primary btn flex-1">
              {t('components.brlaKYCForm.buttons.finish')}
            </button>
          </div>
          <button type="button" className="btn-vortex-primary-inverse btn flex-1" onClick={compareFeesClick}>
            {t('components.brlaKYCForm.buttons.compareFees')}
          </button>
        </div>
      </motion.form>
    </FormProvider>
  );
};
