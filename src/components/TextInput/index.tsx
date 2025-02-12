import { UseFormRegisterReturn } from 'react-hook-form';

const patterns: Record<string, string> = {
  email: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
  default: '^(0x[a-fA-F0-9]{40})$',
};

function getPattern(textInputType?: string) {
  if (textInputType && patterns[textInputType]) {
    return patterns[textInputType];
  }

  return patterns.default;
}

interface TextInputProps {
  register: UseFormRegisterReturn;
  readOnly?: boolean;
  additionalStyle?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
}

export const TextInput = ({
  register,
  readOnly = false,
  additionalStyle,
  autoFocus,
  disabled,
  placeholder,
  type,
}: TextInputProps) => (
  <div className="flex-grow text-black font-outfit">
    <input
      className={
        'h-[3rem] input input-ghost w-full text-lg font-outfit pl-2 focus:outline-none focus:text-accent-content text-accent-content disabled:text-gray-200 ' +
        additionalStyle
      }
      type={type || 'text'}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck="false"
      placeholder={placeholder}
      pattern={getPattern(type)}
      readOnly={readOnly}
      disabled={disabled}
      autoFocus={autoFocus}
      {...register}
    />
  </div>
);
