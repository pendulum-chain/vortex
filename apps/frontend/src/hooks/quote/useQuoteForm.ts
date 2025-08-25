import { yupResolver } from "@hookform/resolvers/yup";
import { FiatToken } from "@packages/shared";
import { useCallback, useEffect } from "react";
import { UseFormReturn, useForm } from "react-hook-form";
import { useRampActor } from "../../contexts/rampState";
import {
  DEFAULT_QUOTE_FORM_STORE_VALUES,
  useFiatToken,
  useInputAmount,
  useLastConstraintDirection,
  useOnChainToken,
  useQuoteFormStoreActions
} from "../../stores/quote/useQuoteFormStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { useDebouncedFormValue } from "../ramp/useDebouncedFormValue";
import { QuoteFormValues, useSchema } from "./schema";

const DEFAULT_QUOTE_FORM_VALUES: QuoteFormValues = {
  ...DEFAULT_QUOTE_FORM_STORE_VALUES,
  deadline: 0,
  inputAmount: "",
  outputAmount: undefined,
  slippage: 0
};

export const useQuoteForm = (): {
  form: UseFormReturn<QuoteFormValues>;
  reset: () => void;
} => {
  const formSchema = useSchema();

  const form = useForm<QuoteFormValues>({
    defaultValues: DEFAULT_QUOTE_FORM_VALUES,
    resolver: yupResolver(formSchema)
  });

  const rampActor = useRampActor();
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();
  const direction = useRampDirection();
  const lastConstraintDirection = useLastConstraintDirection();

  const {
    setInputAmount,
    setOnChainToken,
    setFiatToken,
    setConstraintDirection,
    reset: resetStore
  } = useQuoteFormStoreActions();

  const enforceTokenConstraints = useCallback((token: FiatToken): FiatToken => {
    return token;
  }, []);

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name === "onChainToken" && values.onChainToken !== undefined) {
        setOnChainToken(values.onChainToken);
      }
    });

    return () => subscription.unsubscribe();
  }, [form, setOnChainToken]);

  // Watch inputAmount specifically with debounce
  const inputAmountValue = form.watch("inputAmount");
  useDebouncedFormValue(inputAmountValue, value => setInputAmount(value || "0"), 1000);

  useEffect(() => {
    const currentInputAmount = form.getValues("inputAmount");
    const storeInputAmountStr = inputAmount?.toString() || "0";
    rampActor.send({ message: undefined, type: "SET_INITIALIZE_FAILED_MESSAGE" });

    if (storeInputAmountStr !== "0" && currentInputAmount !== storeInputAmountStr) {
      form.setValue("inputAmount", storeInputAmountStr);
    }
  }, [form, inputAmount, rampActor]);

  useEffect(() => {
    const currentOnChainToken = form.getValues("onChainToken");
    rampActor.send({ message: undefined, type: "SET_INITIALIZE_FAILED_MESSAGE" });

    if (onChainToken && onChainToken !== currentOnChainToken) {
      form.setValue("onChainToken", onChainToken);
    }
  }, [form, onChainToken, rampActor]);

  useEffect(() => {
    const currentFiatToken = form.getValues("fiatToken");
    const constrainedToken = enforceTokenConstraints(fiatToken);

    rampActor.send({ message: undefined, type: "SET_INITIALIZE_FAILED_MESSAGE" });

    if (constrainedToken !== currentFiatToken) {
      form.setValue("fiatToken", constrainedToken);
      setFiatToken(constrainedToken);
    }
    // Mark that constraints are applied for this direction
    if (lastConstraintDirection !== direction) {
      setConstraintDirection(direction);
    }
  }, [
    form,
    fiatToken,
    direction,
    enforceTokenConstraints,
    setFiatToken,
    setConstraintDirection,
    lastConstraintDirection,
    rampActor
  ]);

  const reset = () => {
    resetStore();
    form.reset(DEFAULT_QUOTE_FORM_VALUES);
  };

  return {
    form,
    reset
  };
};
