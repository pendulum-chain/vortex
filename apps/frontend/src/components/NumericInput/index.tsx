import { NumoraInput } from "numora-react";
import { ChangeEvent, useEffect, useRef } from "react";
import { UseFormRegisterReturn, useFormContext, useWatch } from "react-hook-form";
import { cn } from "../../helpers/cn";

interface NumericInputProps {
  register: UseFormRegisterReturn;
  readOnly?: boolean;
  additionalStyle?: string;
  maxDecimals?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange?: (e: ChangeEvent) => void;
}

function trimToMaxDecimals(value: string, maxDecimals: number): string {
  const [integer, decimal] = value.split(".");
  return decimal ? `${integer}.${decimal.slice(0, maxDecimals)}` : value;
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
  const { name: fieldName, ref, onBlur } = register;
  const inputValue = useWatch({ name: fieldName });
  const prevMaxDecimals = useRef(maxDecimals);

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    setValue(fieldName, e.target.value, { shouldDirty: true, shouldValidate: true });
    if (onChange) onChange(e);
  }

  // Watch for maxDecimals changes and trim value if needed
  useEffect(() => {
    if (prevMaxDecimals.current > maxDecimals && inputValue) {
      const trimmed = trimToMaxDecimals(inputValue, maxDecimals);
      if (trimmed !== inputValue) {
        setValue(fieldName, trimmed, { shouldDirty: true, shouldValidate: true });
      }
    }
    prevMaxDecimals.current = maxDecimals;
  }, [maxDecimals, inputValue, setValue, fieldName]);

  return (
    <div className="relative flex-grow">
      <NumoraInput
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
        maxDecimals={maxDecimals}
        name={fieldName}
        onBlur={onBlur}
        onChange={handleChange}
        placeholder="0.0"
        readOnly={readOnly}
        ref={ref}
        spellCheck={false}
        value={inputValue ?? ""}
      />
      {loading && <span className="-translate-y-1/2 loading loading-bars loading-sm absolute top-1/2 right-3 text-primary" />}
    </div>
  );
};
