import { useEffect, useRef, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { SwapFormValues } from '../../components/Nabla/schema';
import { useRampFormStore } from '../../stores/ramp/useRampFormStore';

/**
 * Hook that connects React Hook Form with the Zustand store
 * Creates a form instance and connects it to the store state
 */
export const useRampForm = () => {
  // Create the form instance
  const form = useForm<SwapFormValues>({
    defaultValues: {
      fromAmount: '',
      toAmount: '',
      taxId: '',
      pixId: '',
    },
  });

  // Get the form store
  const {
    onFromChange,
    onToChange,
    setTaxId,
    setPixId,
    fromAmount,
    fromAmountString,
    from,
    to,
    isTokenSelectModalVisible,
    tokenSelectModalType,
    openTokenSelectModal,
    closeTokenSelectModal,
    reset: resetStore,
  } = useRampFormStore();

  // Check if this is the first render
  const isFirstRender = useRef(true);

  // Connect form values to the store
  useEffect(() => {
    // Don't run on first render to avoid initial value conflicts
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Subscribe to form value changes
    const subscription = form.watch((values, { name }) => {
      // Only update store when specific fields change
      if (name === 'fromAmount' && values.fromAmount !== undefined) {
        onFromChange(values.fromAmount);
      } else if (name === 'toAmount' && values.toAmount !== undefined) {
        onToChange(values.toAmount);
      } else if (name === 'taxId' && values.taxId !== undefined) {
        setTaxId(values.taxId);
      } else if (name === 'pixId' && values.pixId !== undefined) {
        setPixId(values.pixId);
      }
    });

    // Cleanup subscription
    return () => subscription.unsubscribe();
  }, [form, onFromChange, onToChange, setTaxId, setPixId]);

  // Update form when store values change
  useEffect(() => {
    if (fromAmountString !== form.getValues('fromAmount')) {
      form.setValue('fromAmount', fromAmountString);
    }
  }, [fromAmountString, form]);

  // Additional state for form-specific features
  const [formTouched, setFormTouched] = useState(false);

  // Mark the form as touched when fields are interacted with
  const handleFormInteraction = useCallback(() => {
    if (!formTouched) {
      setFormTouched(true);
    }
  }, [formTouched]);

  // Register form interaction handlers
  useEffect(() => {
    const formElement = document.querySelector('form');
    if (formElement) {
      formElement.addEventListener('input', handleFormInteraction);
      return () => {
        formElement.removeEventListener('input', handleFormInteraction);
      };
    }
  }, [handleFormInteraction]);


  const resetForm = useCallback(() => {
    form.reset({
      fromAmount: '',
      toAmount: '',
      taxId: '',
      pixId: '',
    });

    // Reset store values
    resetStore();

    // Reset local state
    setFormTouched(false);
  }, [form, resetStore]);

  /**
   * Check if the form is valid
   */
  const isFormValid = useCallback(() => {
    return !form.formState.errors || Object.keys(form.formState.errors).length === 0;
  }, [form.formState.errors]);

  const setFieldValue = useCallback((field: keyof SwapFormValues, value: string) => {
    form.setValue(field, value);


    if (field === 'fromAmount') {
      onFromChange(value);
    } else if (field === 'taxId') {
      setTaxId(value);
    } else if (field === 'pixId') {
      setPixId(value);
    }
  }, [form, onFromChange, setTaxId, setPixId]);

  return {
    form,
    fromAmount,
    from,
    to,
    isTokenSelectModalVisible,
    tokenSelectModalType,
    openTokenSelectModal,
    closeTokenSelectModal,
    resetForm,
    isFormValid,
    formTouched,
    setFieldValue,
  };
};