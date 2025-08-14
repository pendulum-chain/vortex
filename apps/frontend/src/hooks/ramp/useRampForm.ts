import { yupResolver } from "@hookform/resolvers/yup";
import { FiatToken } from "@packages/shared";
import { useCallback, useEffect } from "react";
import { UseFormReturn, useForm } from "react-hook-form";
import { RampDirection } from "../../components/RampToggle";
import { useRampActor } from "../../contexts/rampState";
import {
  DEFAULT_RAMP_FORM_STORE_VALUES,
  useFiatToken,
  useInputAmount,
  useLastConstraintDirection,
  useOnChainToken,
  usePixId,
  useRampFormStoreActions,
  useTaxId
} from "../../stores/ramp/useRampFormStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { RampFormValues, useSchema } from "./schema";
import { useDebouncedFormValue } from "./useDebouncedFormValue";

const DEFAULT_RAMP_FORM_VALUES: RampFormValues = {
  ...DEFAULT_RAMP_FORM_STORE_VALUES,
  deadline: 0,
  inputAmount: "",
  outputAmount: undefined,
  slippage: 0
};

export const useRampForm = (): {
  form: UseFormReturn<RampFormValues>;
  reset: () => void;
} => {
  const formSchema = useSchema();

  const form = useForm<RampFormValues>({
    defaultValues: DEFAULT_RAMP_FORM_VALUES,
    resolver: yupResolver(formSchema)
  });

  const rampActor = useRampActor();
  const taxId = useTaxId();
  const pixId = usePixId();
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();
  const direction = useRampDirection();
  const lastConstraintDirection = useLastConstraintDirection();

  const {
    setInputAmount,
    setOnChainToken,
    setFiatToken,
    setTaxId,
    setPixId,
    setConstraintDirection,
    reset: resetStore
  } = useRampFormStoreActions();

  const enforceTokenConstraints = useCallback((token: FiatToken): FiatToken => {
    return token;
  }, []);

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name === "taxId" && values.taxId !== undefined) {
        setTaxId(values.taxId);
      } else if (name === "pixId" && values.pixId !== undefined) {
        setPixId(values.pixId);
      } else if (name === "onChainToken" && values.onChainToken !== undefined) {
        setOnChainToken(values.onChainToken);
      }
    });

    return () => subscription.unsubscribe();
  }, [form, setTaxId, setPixId, setOnChainToken]);

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

  useEffect(() => {
    const currentTaxId = form.getValues("taxId");
    rampActor.send({ message: undefined, type: "SET_INITIALIZE_FAILED_MESSAGE" });

    if (taxId !== currentTaxId) {
      form.setValue("taxId", taxId || "");
    }
  }, [form, taxId, rampActor]);

  useEffect(() => {
    const currentPixId = form.getValues("pixId");

    rampActor.send({ message: undefined, type: "SET_INITIALIZE_FAILED_MESSAGE" });
    if (pixId !== currentPixId) {
      form.setValue("pixId", pixId || "");
    }
  }, [form, pixId, rampActor]);

  const reset = () => {
    resetStore();
    form.reset(DEFAULT_RAMP_FORM_VALUES);
  };

  return {
    form,
    reset
  };
};
