import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { AveniaKycFormData } from "@vortexfi/kyc";
import { isValidCnpj } from "@vortexfi/shared";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  fullName: z.string().min(3, "Enter the registered company name"),
  taxId: z.string().refine(isValidCnpj, "Enter a valid CNPJ")
});

type FormValues = z.infer<typeof schema>;

interface AveniaKybFormScreenProps {
  initialData?: AveniaKycFormData;
  onCancel: () => void;
  onSubmit: (data: AveniaKycFormData) => void;
}

export function AveniaKybFormScreen({ initialData, onCancel, onSubmit }: AveniaKybFormScreenProps) {
  const form = useForm<FormValues>({
    defaultValues: { fullName: initialData?.fullName ?? "", taxId: initialData?.taxId ?? "" },
    resolver: standardSchemaResolver(schema)
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(values =>
          onSubmit({
            birthdate: "",
            cep: "",
            city: "",
            email: "",
            fullName: values.fullName,
            number: "",
            pixId: "",
            state: "",
            street: "",
            taxId: values.taxId
          })
        )}
      >
        <div className="grid gap-4 py-2">
          <div>
            <h3 className="font-medium text-sm">Company information</h3>
            <p className="text-muted-foreground text-sm">
              Avenia uses this information to create your Brazilian business profile.
            </p>
          </div>
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Registered company name</FormLabel>
                <FormControl>
                  <Input autoComplete="organization" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="taxId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CNPJ</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" placeholder="00.000.000/0000-00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter className="pt-4">
          <Button onClick={onCancel} type="button" variant="ghost">
            Cancel
          </Button>
          <Button type="submit">Continue</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
