import { ChangeEvent, ClipboardEvent } from "react";
import { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "../../helpers/cn";
import { handleOnChangeNumericInput, handleOnPasteNumericInput } from "./helpers";

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
  defaultValue,
  autoFocus,
  onChange,
  loading = false,
  disabled = false
}: NumericInputProps) => {
  function handleOnChange(e: ChangeEvent): void {
    handleOnChangeNumericInput(e, maxDecimals);
    if (onChange) onChange(e);
    register.onChange(e);
  }

  function handleOnPaste(e: ClipboardEvent): void {
    handleOnPasteNumericInput(e, maxDecimals);
    register.onChange(e);
  }

  return (
    <div className="relative flex-grow">
      <input
        {...register}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        className={cn(
          "input h-full w-full border-0 bg-transparent px-4 focus:shadow-none focus:outline-none",
          additionalStyle,
          disabled && "opacity-0"
        )}
        minLength={1}
        onChange={handleOnChange}
        onPaste={handleOnPaste}
        pattern="^[0-9]*[.,]?[0-9]*$"
        placeholder="0.0"
        readOnly={readOnly}
        disabled={disabled}
        spellCheck={false}
        step="any"
        type="text"
        inputMode="decimal"
        value={defaultValue}
        autoFocus={autoFocus}
      />
      {loading && (
        <span className="-translate-y-1/2 loading loading-bars loading-sm absolute top-1/2 right-3 text-primary"></span>
      )}
    </div>
  );
};
