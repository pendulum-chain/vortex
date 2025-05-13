import { useCallback, useEffect } from 'react';
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

  const initializeStorageWithTaxId = useCallback(() => {
    localStorage.setItem(BRLA_KYC_FORM_STORAGE_KEY, JSON.stringify({ taxId }));
  }, [taxId]);

  useEffect(() => {
    const savedData = localStorage.getItem(BRLA_KYC_FORM_STORAGE_KEY);

    if (!savedData) {
      initializeStorageWithTaxId();
      return;
    }

    try {
      const parsedData = JSON.parse(savedData);
      Object.entries(parsedData).forEach(([key, value]) => {
        setValue(key as Path<T>, value as PathValue<T, Path<T>>, { shouldValidate: true });
      });
    } catch (error) {
      console.error('Error loading form data from localStorage:', error);
    }
  }, [setValue, initializeStorageWithTaxId]);

  useEffect(() => {
    const subscription = watch((data) => {
      saveToStorage(data as T);
    });
    return () => subscription.unsubscribe();
  }, [watch, saveToStorage]);

  const clearStorage = () => {
    localStorage.removeItem(BRLA_KYC_FORM_STORAGE_KEY);
  };

  return {
    clearStorage,
  };
};
