import { Input } from 'react-daisyui';
import { UseFormRegisterReturn } from 'react-hook-form';

interface NumericInputProps {
  register: UseFormRegisterReturn;
  readOnly?: boolean;
  additionalStyle?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: boolean;
  placeholder?: string;
  type?: string;
}

export const TextInput = ({
  register,
  readOnly = false,
  additionalStyle,
  autoFocus,
  disabled,
  error,
  placeholder,
  type,
}: NumericInputProps) => (
  <div className="flex-grow text-black font-outfit">
    <Input
      className={
        'input-ghost w-full text-lg font-outfit pl-2 focus:outline-none focus:text-accent-content text-accent-content disabled:text-gray-200 ' +
        additionalStyle
      }
      type={type || 'text'}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck="false"
      placeholder={placeholder}
      error={error}
      pattern={type === 'email' ? undefined : '^(0x[a-fA-F0-9]{40})$'}
      readOnly={readOnly}
      disabled={disabled}
      autoFocus={autoFocus}
      {...register}
    />
  </div>
);
