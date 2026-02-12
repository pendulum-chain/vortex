import { InputHTMLAttributes } from "react";
import { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "../../helpers/cn";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  register?: UseFormRegisterReturn;
  error?: boolean;
}

export const Field = ({ className, register, error, ...rest }: FieldProps) => (
  <input
    className={cn(
      "input-vortex-primary input-ghost w-full rounded-lg border p-2",
      error ? "border-red-800" : "border-neutral-300",
      className
    )}
    {...register}
    {...rest}
  />
);
