import { zodResolver } from "@hookform/resolvers/zod";
import type { AveniaKycFormData } from "@vortexfi/kyc";
import { type Control, type FieldPath, type FieldValues, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface AveniaKycFormScreenProps {
  initialData?: AveniaKycFormData;
  onCancel: () => void;
  onSubmit: (data: AveniaKycFormData) => void;
}

const DEFAULT_VALUES: AveniaKycFormData = {
  birthdate: "",
  cep: "",
  city: "",
  email: "",
  fullName: "",
  number: "",
  pixId: "",
  state: "",
  street: "",
  taxId: ""
};

const aveniaKycFormSchema = z.object({
  birthdate: z.string().min(1, "Enter a birth date"),
  cep: z.string().min(8, "Enter a valid CEP"),
  city: z.string().min(1, "Enter a city"),
  email: z.string().email("Enter a valid email"),
  fullName: z.string().min(2, "Enter a full name"),
  number: z.string().min(1, "Enter a number"),
  pixId: z.string().min(1, "Enter a PIX key"),
  state: z.string().min(2, "Enter a state"),
  street: z.string().min(1, "Enter a street"),
  taxId: z.string().min(11, "Enter a CPF")
}) satisfies z.ZodType<AveniaKycFormData>;

export function AveniaKycFormScreen({ initialData, onCancel, onSubmit }: AveniaKycFormScreenProps) {
  const form = useForm<AveniaKycFormData>({
    defaultValues: initialData ?? DEFAULT_VALUES,
    resolver: zodResolver(aveniaKycFormSchema)
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid max-h-[55vh] gap-4 overflow-y-auto py-2 pr-1">
          <div>
            <h3 className="font-medium text-sm">Personal information</h3>
            <p className="text-muted-foreground text-sm">
              This information is submitted to Avenia for BRL sender verification.
            </p>
          </div>

          <TextField control={form.control} label="Full name" name="fullName" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} label="CPF" name="taxId" />
            <TextField control={form.control} label="Date of birth" name="birthdate" type="date" />
          </div>
          <TextField control={form.control} label="Email" name="email" type="email" />
          <TextField control={form.control} label="PIX key" name="pixId" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} label="CEP" name="cep" />
            <TextField control={form.control} label="State" name="state" />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <TextField control={form.control} label="Street" name="street" />
            <TextField control={form.control} label="Number" name="number" />
          </div>
          <TextField control={form.control} label="City" name="city" />
        </div>

        <DialogFooter className="pt-4">
          <Button onClick={onCancel} type="button" variant="ghost">
            Cancel
          </Button>
          <Button type="submit">Create Avenia profile</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function TextField<T extends FieldValues>({
  control,
  label,
  name,
  type = "text"
}: {
  control: Control<T>;
  label: string;
  name: FieldPath<T>;
  type?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
