import { Input } from 'react-daisyui';
import { UseFormRegisterReturn } from 'react-hook-form';
import { handleOnChangeNumericInput, handleOnPasteNumericInput } from './helpers';

interface NumericInputProps {
  register: UseFormRegisterReturn;
  readOnly?: boolean;
  additionalStyle?: string;
  maxDecimals?: number;
  defaultValue?: string;
  autoFocus?: boolean;
  disableStyles?: boolean;
  onChange?: (e: KeyboardEvent) => void;
}

export const NumericInput = ({
  register,
  readOnly = false,
  additionalStyle,
  maxDecimals = 2,
  defaultValue,
  autoFocus,
  disableStyles = false,
  onChange,
}: NumericInputProps) => {
  function handleOnChange(e: KeyboardEvent): void {
    handleOnChangeNumericInput(e, maxDecimals);
    if (onChange) onChange(e);
    register.onChange(e);
  }

  function handleOnPaste(e: ClipboardEvent): void {
    handleOnPasteNumericInput(e, maxDecimals);
    register.onChange(e);
  }

  return (
    <div className={disableStyles ? 'flex-grow' : 'flex-grow text-black font-outfit'}>
      <Input
        {...register}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        className={
          disableStyles
            ? 'border-0 bg-transparent focus:outline-none px-4 ' + additionalStyle
            : 'input-ghost w-full text-lg pl-2 focus:outline-none text-accent-content ' + additionalStyle
        }
        minlength="1"
        onChange={handleOnChange}
        onPaste={handleOnPaste}
        pattern="^[0-9]*[.,]?[0-9]*$"
        placeholder="0.0"
        readOnly={readOnly}
        spellcheck="false"
        step="any"
        type="text"
        inputmode="decimal"
        value={defaultValue}
        autoFocus={autoFocus}
      />
    </div>
  );
};
