import { InputHTMLAttributes } from "react";
import { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "../../helpers/cn";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  register?: UseFormRegisterReturn;
}

export const Field = ({ className, register, ...rest }: FieldProps) => (
  <input
    className={cn("input-vortex-primary input-ghost w-full rounded-lg border-1 border-neutral-300 p-2", className)}
    {...register}
    {...rest}
  />
);
