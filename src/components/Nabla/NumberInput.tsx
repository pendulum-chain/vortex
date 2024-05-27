import { HTMLAttributes, useCallback } from 'preact/compat';
import { FieldPath, FieldValues, useFormContext } from 'react-hook-form';

export interface NumberInputProps<SwapFormValues extends FieldValues> extends HTMLAttributes<HTMLInputElement> {
  registerName: FieldPath<SwapFormValues>;
  disabled: boolean;
}

// Hack required for Preact compatibility with react-hook-form
export function NumberInput<SwapFormValues extends FieldValues>(attributes: NumberInputProps<SwapFormValues>) {
  const { register } = useFormContext<SwapFormValues>();

  const { registerName, disabled } = attributes;

  const registerAttributes: HTMLAttributes<HTMLInputElement> = register(registerName);
  const { onChange } = registerAttributes;
  const attributesWithoutOnChange = { ...registerAttributes };
  delete attributesWithoutOnChange.onChange;

  const onInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let number = e.currentTarget.value.replace(/[^0-9.]/g, '');
      const periodIndex = number.indexOf('.');
      if (periodIndex > -1) {
        number = number.slice(0, periodIndex + 1) + number.slice(periodIndex + 1).replace(/\./g, '');
      }

      e.currentTarget.value = number;
      onChange?.(e);
    },
    [onChange],
  );

  return <input inputMode="numeric" type="text" {...attributesWithoutOnChange} {...attributes} disabled={disabled} onInput={onInput} />;
}