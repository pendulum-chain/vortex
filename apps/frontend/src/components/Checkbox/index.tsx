import type { InputHTMLAttributes } from "react";

type CheckboxProps = InputHTMLAttributes<HTMLInputElement>;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input className={`checkbox checkbox-primary checkbox-sm${className ? ` ${className}` : ""}`} type="checkbox" {...props} />
  );
}
