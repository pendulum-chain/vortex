import { yupResolver } from "@hookform/resolvers/yup";
import { UseFormReturn, useForm } from "react-hook-form";
import { RampFormValues, useSchema } from "./schema";

export const useRampForm = (): {
  form: UseFormReturn<RampFormValues>;
  reset: () => void;
} => {
  const formSchema = useSchema();

  const form = useForm<RampFormValues>({
    resolver: yupResolver(formSchema)
  });

  return {
    form,
    reset: form.reset
  };
};
