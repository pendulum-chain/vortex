import { Input } from 'react-daisyui';
import { UseFormRegisterReturn } from 'react-hook-form';
import { handleOnChangeNumericInput, handleOnPasteNumericInput } from './helpers';
import { ChangeEvent, ClipboardEvent } from 'react';

interface NumericInputProps {
  register: UseFormRegisterReturn;
  readOnly?: boolean;
  additionalStyle?: string;
  maxDecimals?: number;
  defaultValue?: string;
  autoFocus?: boolean;
  disableStyles?: boolean;
  disabled?: boolean;
  onChange?: (e: ChangeEvent) => void;
}

export const NumericInput = ({
  register,
  readOnly = false,
  additionalStyle,
  maxDecimals = 2,
  defaultValue,
  autoFocus,
  disableStyles = false,
  disabled,
  onChange,
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
  console.log(defaultValue, 'defaultValue');
  const removeText = disabled ? ' text-white' : '';
  return (
    <div className={disableStyles ? 'relative flex-grow' : 'relative flex-grow text-black font-outfit'}>
      <Input
        {...register}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        className={
          disableStyles
            ? 'border-0 bg-transparent focus:outline-none px-4 text-opacity-100 ' + additionalStyle + removeText
            : 'input-ghost w-full text-lg pl-2 focus:outline-none text-accent-content text-opacity-100' + removeText
        }
        minLength={1}
        onChange={handleOnChange}
        onPaste={handleOnPaste}
        pattern="^[0-9]*[.,]?[0-9]*$"
        placeholder="0.0"
        readOnly={readOnly}
        spellCheck={false}
        step="any"
        type="text"
        inputMode="decimal"
        value={defaultValue}
        autoFocus={autoFocus}
      />
      {disabled && (
        <span className="absolute top-1/2 right-3 -translate-y-1/2 loading loading-bars loading-sm text-primary"></span>
      )}
    </div>
  );
};
