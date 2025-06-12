import { InputHTMLAttributes } from 'react';
import { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '../../helpers/cn';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  register?: UseFormRegisterReturn;
}

export const Field = ({ className, register, ...rest }: FieldProps) => (
  <input
    className={cn('input-vortex-primary border-1 border-neutral-300 input-ghost w-full p-2 rounded-lg', className)}
    {...register}
    {...rest}
  />
);
