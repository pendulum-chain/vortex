import { ChangeEvent, ClipboardEvent, useEffect, useRef } from 'react';
import { UseFormRegisterReturn, useFormContext, useWatch } from 'react-hook-form';
import { cn } from '../../helpers/cn';
import { handleOnChangeNumericInput, handleOnPasteNumericInput } from './helpers';

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
  disabled = false,
}: NumericInputProps) => {
  const { setValue } = useFormContext();
  const fieldName = register.name;
  const inputValue = useWatch({ name: fieldName });
  const prevMaxDecimals = useRef(maxDecimals);

  function trimToMaxDecimals(value: string, decimals: number) {
    if (!value) return value;
    const [intPart, decPart] = value.replace(',', '.').split('.');
    let trimmed = value;
    if (decPart && decPart.length > decimals) {
      trimmed = `${intPart}.${decPart.slice(0, decimals)}`;
    }
    return trimmed;
  }

  function handleOnChange(e: ChangeEvent<HTMLInputElement>): void {
    handleOnChangeNumericInput(e, maxDecimals);
    const value = e.target.value;
    setValue(fieldName, value, { shouldValidate: true, shouldDirty: true });
    if (onChange) onChange(e);
    register.onChange(e);
  }

  function handleOnPaste(e: ClipboardEvent<HTMLInputElement>): void {
    handleOnPasteNumericInput(e, maxDecimals);
    // After paste, update value from event
    const pasted = e.clipboardData.getData('Text');
    const trimmed = trimToMaxDecimals(pasted, maxDecimals);
    setValue(fieldName, trimmed, { shouldValidate: true, shouldDirty: true });
    // Create a synthetic event for register.onChange
    const syntheticEvent = {
      ...e,
      target: { ...e.target, value: trimmed },
    } as unknown as ChangeEvent<HTMLInputElement>;
    register.onChange(syntheticEvent);
  }

  // Watch for maxDecimals changes and trim value if needed
  useEffect(() => {
    if (prevMaxDecimals.current > maxDecimals) {
      const trimmed = trimToMaxDecimals(inputValue, maxDecimals);
      if (trimmed !== inputValue) {
        setValue(fieldName, trimmed, { shouldValidate: true, shouldDirty: true });
        // Create a synthetic event for register.onChange
        const syntheticEvent = { target: { value: trimmed } } as ChangeEvent<HTMLInputElement>;
        register.onChange(syntheticEvent);
      }
    }
    prevMaxDecimals.current = maxDecimals;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDecimals, inputValue, setValue, fieldName, register]);

  return (
    <div className="relative flex-grow">
      <input
        {...register}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        className={cn(
          'input border-0 focus:shadow-none bg-transparent focus:outline-none px-4 w-full h-full',
          additionalStyle,
          disabled && 'opacity-0',
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
        value={inputValue ?? ''}
        autoFocus={autoFocus}
      />
      {loading && (
        <span className="absolute top-1/2 right-3 -translate-y-1/2 loading loading-bars loading-sm text-primary"></span>
      )}
    </div>
  );
};
