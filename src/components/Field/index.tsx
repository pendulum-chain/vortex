import { InputHTMLAttributes } from 'react';
import { UseFormRegisterReturn } from 'react-hook-form';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  register?: UseFormRegisterReturn;
}

export const Field = ({ className, ...rest }: FieldProps) => (
  <input
    className={`input-vortex-primary border-1 border-neutral-300 input-ghost w-full p-2 rounded-lg ${className || ''}`}
    {...rest}
  />
);
