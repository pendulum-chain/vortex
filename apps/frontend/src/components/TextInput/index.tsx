import { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "../../helpers/cn";

const patterns: Record<string, string> = {
  default: "^(0x[a-fA-F0-9]{40})$",
  email: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
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
  type
}: TextInputProps) => (
  <div className="flex-grow font-outfit text-black">
    <input
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      autoFocus={autoFocus}
      className={cn(
        "input-vortex-primary input input-lg w-full py-2 pl-2 font-outfit text-accent-content disabled:text-gray-200",
        additionalStyle
      )}
      disabled={disabled}
      pattern={getPattern(type)}
      placeholder={placeholder}
      readOnly={readOnly}
      spellCheck="false"
      type={type || "text"}
      {...register}
    />
  </div>
);
