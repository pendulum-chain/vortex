import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect } from "react";
import { UseFormReturn, useForm } from "react-hook-form";
import { RampFormValues, useSchema } from "./schema";

export const useRampForm = (
  defaultValues?: Partial<RampFormValues>
): {
  form: UseFormReturn<RampFormValues>;
  reset: () => void;
} => {
  const formSchema = useSchema();

  const form = useForm<RampFormValues>({
    defaultValues,
    mode: "onBlur", // Validate on blur instead of every keystroke for better performance
    resolver: yupResolver(formSchema)
  });

  // Trigger validation on mount when default values exist (widget mode)
  // This ensures isValid is accurate immediately for pre-filled BRL forms
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally run once on mount only
  useEffect(() => {
    if (defaultValues && Object.keys(defaultValues).length > 0) {
      form.trigger();
    }
  }, []);

  return {
    form,
    reset: form.reset
  };
};
