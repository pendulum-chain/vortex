import { applyLocale, FormatOn, formatValueForDisplay, ThousandStyle } from "numora";
import { NumoraInput, type NumoraInputChangeEvent } from "numora-react";
import { useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";
import { TextMorph } from "torph/react";
import { cn } from "../../helpers/cn";
import type { QuoteFormValues } from "../../hooks/quote/schema";

// Single locale source for both the NumoraInput and the formatting helpers below.
// `true` resolves the user's browser locale. Set to a fixed tag (e.g. "de-DE") to test a locale.
const LOCALE = true;

const FORMATTING_OPTIONS = {
  autoAddLeadingZero: true,
  formatOn: FormatOn.Change,
  thousandStyle: ThousandStyle.Thousand,
  ...applyLocale(LOCALE, {})
};

const PLACEHOLDER = "0";

const DECIMAL_SEPARATOR = FORMATTING_OPTIONS.decimalSeparator ?? ".";
const THOUSAND_SEPARATOR = FORMATTING_OPTIONS.thousandSeparator ?? ",";

// Form state holds a dot-decimal numeric string so downstream Big(...) parsing stays valid.
// Numora reports its value using the active locale's separators (e.g. de-DE "1.234,56"), so we
// convert at the two boundaries: drop thousand separators and swap the decimal separator for a dot
// when storing, and swap dot -> locale decimal separator when handing the value back for display.
const toFormValue = (raw: string) => raw.split(THOUSAND_SEPARATOR).join("").replace(DECIMAL_SEPARATOR, ".");
const toDisplayValue = (value: string) => value.replace(".", DECIMAL_SEPARATOR);

interface NumericInputProps {
  name: keyof QuoteFormValues;
  readOnly?: boolean;
  additionalStyle?: string;
  maxDecimals?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange?: (e: NumoraInputChangeEvent) => void;
}

export const NumericInput = ({
  name,
  readOnly = false,
  additionalStyle,
  maxDecimals = 2,
  autoFocus,
  onChange,
  loading = false,
  disabled = false
}: NumericInputProps) => {
  // Controlled integration (numora's supported RHF pattern): the form is the source of truth and we
  // feed numora back exactly what it emitted (form value -> locale display). Because that matches
  // numora's own DOM, its equality guard skips the write while typing, so the caret is never moved;
  // and because it's controlled, the app's quote/store/URL re-render churn can't desync the value.
  const { control } = useFormContext();
  const { field } = useController({ control, name });
  const displayValue = field.value ? toDisplayValue(String(field.value)) : "";
  const formatted = useMemo(
    () => (displayValue ? formatValueForDisplay(displayValue, maxDecimals, FORMATTING_OPTIONS).formatted : ""),
    [displayValue, maxDecimals]
  );

  function handleChange(e: NumoraInputChangeEvent): void {
    field.onChange(toFormValue(e.target.value));
    if (onChange) onChange(e);
  }

  const inputClasses = cn(
    "h-full w-full border-0 bg-transparent px-4 shadow-none outline-none focus:shadow-none focus:outline-none",
    "relative text-transparent caret-base-content placeholder:text-transparent",
    disabled && "opacity-0",
    additionalStyle
  );

  // The NumoraInput is visually invisible (text-transparent) and contributes only the caret; the
  // animated number the user actually sees is the TextMorph overlay rendered on top of it.
  return (
    <div className="relative flex-grow">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-end px-4 text-base-content",
          additionalStyle
        )}
      >
        <TextMorph ease={{ damping: 30, stiffness: 400 }}>{formatted || PLACEHOLDER}</TextMorph>
      </div>
      <NumoraInput
        autoAddLeadingZero
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        autoFocus={autoFocus}
        className={inputClasses}
        decimalSeparator={DECIMAL_SEPARATOR}
        disabled={disabled}
        formatOn={FormatOn.Change}
        maxDecimals={maxDecimals}
        name={field.name}
        onBlur={field.onBlur}
        onChange={handleChange}
        placeholder={PLACEHOLDER}
        readOnly={readOnly}
        ref={field.ref}
        spellCheck={false}
        thousandSeparator={THOUSAND_SEPARATOR}
        thousandStyle={ThousandStyle.Thousand}
        value={displayValue}
      />
      {loading && <span className="-translate-y-1/2 loading loading-bars loading-sm absolute top-1/2 right-3 text-primary" />}
    </div>
  );
};
