import { Input } from 'react-daisyui';
import { UseFormRegisterReturn } from 'react-hook-form';
import { useEventsContext } from '../../contexts/events';

export function exceedsMaxDecimals(value: unknown, maxDecimals: number) {
  if (value === undefined || value === null) return true;
  const decimalPlaces = value.toString().split('.')[1];
  return decimalPlaces ? decimalPlaces.length > maxDecimals : false;
}

interface NumericInputProps {
  register: UseFormRegisterReturn;
  readOnly?: boolean;
  additionalStyle?: string;
  maxDecimals?: number;
  defaultValue?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  disableStyles?: boolean;
}

function isValidNumericInput(value: string): boolean {
  return /^[0-9.,]*$/.test(value);
}

function alreadyHasDecimal(e: KeyboardEvent) {
  const decimalChars = ['.', ','];

  // In the onInput event, "," is replaced by ".", so we check if the e.target.value already contains a "."
  return decimalChars.some((char) => e.key === char && e.target && (e.target as HTMLInputElement).value.includes('.'));
}

function handleOnInput(e: KeyboardEvent): void {
  const target = e.target as HTMLInputElement;
  target.value = target.value.replace(/,/g, '.');
}

function handleOnKeyPress(e: KeyboardEvent, maxDecimals: number): void {
  if (!isValidNumericInput(e.key) || alreadyHasDecimal(e)) {
    e.preventDefault();
  }
  const target = e.target as HTMLInputElement;
  if (exceedsMaxDecimals(target.value, maxDecimals - 1)) {
    target.value = target.value.slice(0, -1);
  }
}

export const NumericInput = ({
  register,
  readOnly = false,
  additionalStyle,
  maxDecimals = 2,
  defaultValue,
  autoFocus,
  disabled,
  disableStyles = false,
}: NumericInputProps) => {
  const { trackEvent } = useEventsContext();

  return (
    <div className={disableStyles ? 'flex-grow' : 'flex-grow text-black font-outfit'}>
      <Input
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        className={
          disableStyles
            ? 'border-0 bg-transparent focus:outline-none px-4 ' + additionalStyle
            : 'input-ghost w-full text-lg pl-2 focus:outline-none text-accent-content ' + additionalStyle
        }
        minlength="1"
        onKeyPress={(e: KeyboardEvent) => handleOnKeyPress(e, maxDecimals)}
        onInput={(e: KeyboardEvent) => {
          trackEvent('click');
          handleOnInput(e);
        }}
        pattern="^[0-9]*[.,]?[0-9]*$"
        placeholder="0.0"
        readOnly={readOnly}
        spellcheck="false"
        step="any"
        type="text"
        inputmode="decimal"
        value={defaultValue}
        autoFocus={autoFocus}
        disabled={disabled}
        {...register}
      />
    </div>
  );
};
