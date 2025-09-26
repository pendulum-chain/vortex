import { useEffect } from "react";
import { Path, PathValue, UseFormReturn } from "react-hook-form";
import { debounce } from "../../../hooks/useLocalStorage";

export const BRLA_KYC_FORM_STORAGE_KEY = "brla_kyc_form_data";

export const useKYCFormLocalStorage = <T extends object>(form: UseFormReturn<T>) => {
  const { watch, setValue } = form;

  const saveToStorage = debounce((data: T) => {
    localStorage.setItem(BRLA_KYC_FORM_STORAGE_KEY, JSON.stringify(data));
  }, 500);

  useEffect(() => {
    const savedData = localStorage.getItem(BRLA_KYC_FORM_STORAGE_KEY);

    if (!savedData) {
      return;
    }

    try {
      const parsedData = JSON.parse(savedData);
      Object.entries(parsedData).forEach(([key, value]) => {
        setValue(key as Path<T>, value as PathValue<T, Path<T>>, { shouldValidate: true });
      });
    } catch (error) {
      console.error("Error loading form data from localStorage:", error);
    }
  }, [setValue]);

  useEffect(() => {
    const subscription = watch(data => {
      saveToStorage(data as T);
    });
    return () => subscription.unsubscribe();
  }, [watch, saveToStorage]);

  const clearStorage = () => {
    localStorage.removeItem(BRLA_KYC_FORM_STORAGE_KEY);
  };

  return {
    clearStorage
  };
};
