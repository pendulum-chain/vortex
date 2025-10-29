import { ChangeEvent, useEffect, useRef } from "react";
import { UseFormRegisterReturn, useFormContext, useWatch } from "react-hook-form";
import { cn } from "../../helpers/cn";
import { handleOnChangeNumericInput, handleOnPasteNumericInput, trimToMaxDecimals } from "./helpers";

interface NumericInputProps {
  register: UseFormRegisterReturn;
  readOnly?: boolean;
  additionalStyle?: string;
  maxDecimals?: number;
  defaultValue?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange?: (e: ChangeEvent) => void;
}

export const NumericInput = ({
  register,
  readOnly = false,
  additionalStyle,
  maxDecimals = 2,
  autoFocus,
  onChange,
  loading = false,
  disabled = false
}: NumericInputProps) => {
  const { setValue } = useFormContext();
  const fieldName = register.name;
  const inputValue = useWatch({ name: fieldName });
  const prevMaxDecimals = useRef(maxDecimals);

  function handleOnChange(e: ChangeEvent<HTMLInputElement>): void {
    handleOnChangeNumericInput(e, maxDecimals);
    const value = e.target.value;
    setValue(fieldName, value, { shouldDirty: true, shouldValidate: true });
    if (onChange) onChange(e);
    register.onChange(e);
  }

  // Watch for maxDecimals changes and trim value if needed
  useEffect(() => {
    if (prevMaxDecimals.current > maxDecimals) {
      const trimmed = trimToMaxDecimals(inputValue, maxDecimals);
      if (trimmed !== inputValue) {
        setValue(fieldName, trimmed, { shouldDirty: true, shouldValidate: true });
        // Create a synthetic event for register.onChange
        const syntheticEvent = { target: { value: trimmed } } as ChangeEvent<HTMLInputElement>;
        register.onChange(syntheticEvent);
      }
    }
    prevMaxDecimals.current = maxDecimals;
  }, [maxDecimals, inputValue, setValue, fieldName, register]);

  return (
    <div className="relative flex-grow">
      <input
        {...register}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        autoFocus={autoFocus}
        className={cn(
          "input h-full w-full border-0 bg-transparent px-4 focus:shadow-none focus:outline-none",
          additionalStyle,
          disabled && "opacity-0"
        )}
        disabled={disabled}
        inputMode="decimal"
        minLength={1}
        onChange={handleOnChange}
        onPaste={event => handleOnPasteNumericInput(event, maxDecimals)}
        pattern="^[0-9]*[.,]?[0-9]*$"
        placeholder="0.0"
        readOnly={readOnly}
        spellCheck={false}
        step="any"
        type="text"
        value={inputValue ?? ""}
      />
      {loading && (
        <span className="-translate-y-1/2 loading loading-bars loading-sm absolute top-1/2 right-3 text-primary"></span>
      )}
    </div>
  );
};
