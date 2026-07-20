import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { type KybFormData, type KybFormValues, kybFormSchema, mapKybFormValues, toKybFormValues } from "@vortexfi/kyc";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface KybFormScreenProps {
  country: "MX" | "CO";
  /** Details already given, so stepping back from the questionnaire does not blank the form. */
  defaults?: KybFormData;
  onCancel: () => void;
  onSubmit: (data: KybFormData) => void;
  userEmail?: string;
}

export function KybFormScreen({ country, defaults, onCancel, onSubmit, userEmail }: KybFormScreenProps) {
  const form = useForm<KybFormValues>({
    defaultValues: defaults
      ? toKybFormValues(defaults)
      : {
          address: "",
          businessName: "",
          city: "",
          repDateOfBirth: "",
          repDni: "",
          repEmail: userEmail ?? "",
          repFirstName: "",
          repLastName: "",
          repNationality: country,
          repPep: false,
          state: "",
          taxId: "",
          website: "",
          zipCode: ""
        },
    resolver: standardSchemaResolver(kybFormSchema)
  });

  const field = (name: keyof KybFormValues, label: string, type = "text", readOnly = false) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field: input }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              className={readOnly ? "cursor-not-allowed bg-muted text-muted-foreground" : undefined}
              readOnly={readOnly}
              type={type}
              {...input}
              // repPep is the one boolean in this form and renders as its own checkbox below.
              value={typeof input.value === "string" ? input.value : ""}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(values => onSubmit(mapKybFormValues(values)))}>
        <div className="grid max-h-[55vh] gap-4 overflow-y-auto py-2 pr-1">
          <div>
            <h3 className="font-medium">Company details</h3>
            <p className="text-muted-foreground text-sm">Enter the legal details registered for this business.</p>
          </div>
          {field("businessName", "Legal business name")}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("taxId", "Tax ID")}
            {field("website", "Website", "url")}
          </div>
          {field("address", "Registered address")}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("city", "City")}
            {field("state", "State")}
          </div>
          {field("zipCode", "Postal code")}

          <div className="border-t pt-4">
            <h3 className="font-medium">Authorized representative</h3>
            <p className="text-muted-foreground text-sm">This person's identity document is required on the next step.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("repFirstName", "First name")}
            {field("repLastName", "Last name")}
          </div>
          {field("repEmail", "Email", "email", !!userEmail)}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("repDateOfBirth", "Date of birth", "date")}
            {field("repDni", "Document number")}
          </div>
          {field("repNationality", "Nationality (2-letter code)")}
          <FormField
            control={form.control}
            name="repPep"
            render={({ field: input }) => (
              <FormItem className="flex flex-row items-start gap-3 rounded-md border p-3">
                <FormControl>
                  <Checkbox checked={!!input.value} onCheckedChange={checked => input.onChange(checked === true)} />
                </FormControl>
                <FormLabel className="font-normal leading-none">This person is a politically exposed person</FormLabel>
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
