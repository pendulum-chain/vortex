import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export interface TextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  type?: string;
}

/** A labelled text input bound to a react-hook-form field. Only string-valued fields belong here. */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  readOnly,
  type = "text"
}: TextFieldProps<T> & { description?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
            <Input
              className={readOnly ? "cursor-not-allowed bg-muted text-muted-foreground" : undefined}
              placeholder={placeholder}
              readOnly={readOnly}
              type={type}
              {...field}
              value={field.value ?? ""}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
