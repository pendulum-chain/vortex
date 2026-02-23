import { TextareaHTMLAttributes } from "react";
import { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "../../helpers/cn";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  register?: UseFormRegisterReturn;
  error?: boolean;
}

export const TextArea = ({ className, register, error, ...rest }: TextAreaProps) => (
  <textarea
    className={cn(
      "input-vortex-primary input-ghost w-full resize-none rounded-lg border p-2",
      error ? "border-red-800" : "border-neutral-300",
      className
    )}
    {...register}
    {...rest}
  />
);
