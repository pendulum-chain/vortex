import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect, useRef } from "react";
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
    resolver: yupResolver(formSchema)
  });

  const isAddressSet = useRef(false);

  // Only sets the wallet address once. Then it respects the user's choice of
  // onramp destination.
  useEffect(() => {
    if (defaultValues?.walletAddress && !isAddressSet.current) {
      form.setValue("walletAddress", defaultValues.walletAddress);
      isAddressSet.current = true;
    }
  }, [defaultValues?.walletAddress, form.setValue]);

  return {
    form,
    reset: form.reset
  };
};
