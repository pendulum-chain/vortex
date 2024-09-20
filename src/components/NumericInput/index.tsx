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

function handleOnInput(e: Event, maxDecimals: number): void {
  const target = e.target as HTMLInputElement;
  const originalValue = target.value;

  if (target.value === '' || target.value === '.') {
    target.value = '0';
  }

  target.value = target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');

  // Handle case where user tries to add a second decimal point, we keep the leftmost one.
  let firstDotOccurence = target.value.search(/[.]/);
  if (firstDotOccurence !== -1 && target.value[firstDotOccurence] === '.') {
    target.value =
      target.value.slice(0, firstDotOccurence + 1) + target.value.slice(firstDotOccurence + 1).replace('.', '');
  }

  if (exceedsMaxDecimals(target.value, maxDecimals)) {
    target.value = target.value.slice(0, -1);
  }

  // remove leading zeros when the number is >= 1
  if (Number(target.value) >= 1) {
    target.value = target.value.replace(/^0+/, '');
  }

  // Add leading zeros for numbers < 1 that don't start with '0'
  if (Number(target.value) < 1 && target.value[0] !== '0') {
    target.value = '0' + target.value;
  }

  // No more than one leading zero
  target.value = target.value.replace(/^0+/, '0');

  // Dispatch input event if the value has changed, this forces the
  // update on the form. Otherwise the form can get the invalid valiue.
  if (originalValue !== target.value) {
    const newEvent = new Event('input', { bubbles: true, cancelable: true });
    target.dispatchEvent(newEvent);
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
        onInput={(e: Event) => {
          trackEvent({ event: 'amount_type' });
          handleOnInput(e, maxDecimals);
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
