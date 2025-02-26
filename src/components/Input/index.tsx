import { UseFormRegisterReturn } from 'react-hook-form';

interface InputProps {
  register: UseFormRegisterReturn;
  className?: string;
  placeholder?: string;
  id?: string;
  type?: string;
}

export const Input = ({ register, className, placeholder, id, type }: InputProps) => (
  <input
    type={type}
    id={id}
    className={`input-vortex-primary border-1 border-neutral-300 input-ghost w-full p-2 rounded-lg ${className}`}
    {...register}
    placeholder={placeholder}
  />
);
