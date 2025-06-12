import { ChangeEvent, ClipboardEvent } from 'react';
import { UseFormRegisterReturn } from 'react-hook-form';
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
  defaultValue,
  autoFocus,
  onChange,
  loading = false,
  disabled = false,
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
        value={defaultValue}
        autoFocus={autoFocus}
      />
      {loading && (
        <span className="absolute top-1/2 right-3 -translate-y-1/2 loading loading-bars loading-sm text-primary"></span>
      )}
    </div>
  );
};
