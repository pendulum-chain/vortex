import { applyLocale, FormatOn, formatValueForDisplay, ThousandStyle } from "numora";
import { NumoraInput, type NumoraInputChangeEvent } from "numora-react";
import { useMemo } from "react";
import { UseFormRegisterReturn, useFormContext, useWatch } from "react-hook-form";
import { TextMorph } from "torph/react";
import { cn } from "../../helpers/cn";

type NumoraTarget = NumoraInputChangeEvent["target"] & { rawValue?: string };

interface NumericInputProps {
  register: UseFormRegisterReturn;
  readOnly?: boolean;
  additionalStyle?: string;
  maxDecimals?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange?: (e: NumoraInputChangeEvent) => void;
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
  const formatted = useMemo(
    () =>
      inputValue
        ? formatValueForDisplay(String(inputValue), maxDecimals, {
            formatOn: FormatOn.Change,
            thousandStyle: ThousandStyle.Thousand,
            ...applyLocale(true, {})
          }).formatted
        : "",
    [inputValue, maxDecimals]
  );

  function handleChange(e: NumoraInputChangeEvent): void {
    const target = e.target as NumoraTarget;
    const raw = target.rawValue ?? target.value;
    setValue(fieldName, raw, { shouldDirty: true, shouldValidate: true });
    if (onChange) onChange(e);
  }

  const inputClasses = cn(
    "h-full w-full border-0 bg-transparent px-4 shadow-none outline-none focus:shadow-none focus:outline-none",
    additionalStyle
  );

  return (
    <div className="relative flex-grow">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-end px-4 text-base-content",
          additionalStyle
        )}
      >
        <TextMorph ease={{ damping: 30, stiffness: 400 }}>{formatted || "0.0"}</TextMorph>
      </div>
      <NumoraInput
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        autoFocus={autoFocus}
        className={cn(
          inputClasses,
          "relative text-transparent caret-base-content placeholder:text-transparent",
          disabled && "opacity-0"
        )}
        disabled={disabled}
        formatOn={FormatOn.Change}
        locale={true}
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
