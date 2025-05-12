import { useEffect, useCallback } from 'react';
import { Path, PathValue, UseFormReturn } from 'react-hook-form';
import { debounce } from '../../../hooks/useLocalStorage';
import { useTaxId } from '../../../stores/ramp/useRampFormStore';

export const BRLA_KYC_FORM_STORAGE_KEY = 'brla_kyc_form_data';

export const useKYCFormLocalStorage = <T extends object>(form: UseFormReturn<T>) => {
  const taxId = useTaxId();

  const { watch, setValue } = form;

  const saveToStorage = debounce((data: T) => {
    localStorage.setItem(BRLA_KYC_FORM_STORAGE_KEY, JSON.stringify({ ...data, taxId }));
  }, 500);

  useEffect(() => {
    const savedData = localStorage.getItem(BRLA_KYC_FORM_STORAGE_KEY);
    console.log('savedData', savedData);
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        Object.entries(parsedData).forEach(([key, value]) => {
          if (key !== 'taxId') {
            setValue(key as Path<T>, value as PathValue<T, Path<T>>, { shouldValidate: true });
          }
        });
      } catch (error) {
        console.error('Error loading form data from localStorage:', error);
      }
    } else {
      localStorage.setItem(BRLA_KYC_FORM_STORAGE_KEY, JSON.stringify({ taxId }));
    }
  }, [setValue, taxId]);

  useEffect(() => {
    const subscription = watch((data) => {
      saveToStorage(data as T);
    });
    return () => subscription.unsubscribe();
  }, [watch, saveToStorage]);

  const clearStorage = useCallback(() => {
    localStorage.removeItem(BRLA_KYC_FORM_STORAGE_KEY);
  }, []);

  return {
    clearStorage,
  };
};
