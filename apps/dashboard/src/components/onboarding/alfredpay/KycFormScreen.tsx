import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  type AlfredpayKycFormData,
  AR_KYC_DEFAULTS,
  type ArKycFormValues,
  arKycSchema,
  type ColKycFormValues,
  colKycSchema,
  type MxnKycFormValues,
  mxnKycSchema,
  toArPhoneNumber,
  toColPhoneNumber
} from "@vortexfi/kyc";
import { AlfredpayArgentinaDocumentType, AlfredpayColombiaDocumentType } from "@vortexfi/shared";
import { type Control, type FieldPath, type FieldValues, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type AlfredpayKycCountry = "MX" | "CO" | "AR";

interface KycFormScreenProps {
  country: AlfredpayKycCountry;
  onSubmit: (data: AlfredpayKycFormData) => void;
  onCancel: () => void;
}

interface TextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  type?: string;
}

function TextField<T extends FieldValues>({ control, name, label, placeholder, type = "text" }: TextFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input placeholder={placeholder} type={type} {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Phone numbers are stored in the `+<country><number>` form Alfredpay validates against, so the
 * normaliser runs on every keystroke rather than at submit — the schema checks the stored value.
 */
function PhoneField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  normalise
}: TextFieldProps<T> & { normalise: (value: string) => string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              inputMode="numeric"
              onChange={event => field.onChange(normalise(event.target.value))}
              placeholder={placeholder}
              type="tel"
              value={field.value ?? ""}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function NameAndBirth<T extends FieldValues>({ control }: { control: Control<T> }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={control} label="First name" name={"firstName" as FieldPath<T>} />
        <TextField control={control} label="Last name" name={"lastName" as FieldPath<T>} />
      </div>
      <TextField control={control} label="Date of birth" name={"dateOfBirth" as FieldPath<T>} type="date" />
    </>
  );
}

function AddressFields<T extends FieldValues>({ control }: { control: Control<T> }) {
  return (
    <>
      <TextField control={control} label="Address" name={"address" as FieldPath<T>} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={control} label="City" name={"city" as FieldPath<T>} />
        <TextField control={control} label="State" name={"state" as FieldPath<T>} />
      </div>
      <TextField control={control} label="Postal code" name={"zipCode" as FieldPath<T>} />
    </>
  );
}

function FormShell({
  children,
  onCancel,
  onSubmit
}: {
  children: React.ReactNode;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid max-h-[55vh] gap-4 overflow-y-auto py-2 pr-1">{children}</div>
      <DialogFooter className="pt-4">
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button type="submit">Continue</Button>
      </DialogFooter>
    </form>
  );
}

function MxKycForm({ onSubmit, onCancel }: Omit<KycFormScreenProps, "country">) {
  const form = useForm<MxnKycFormValues>({
    defaultValues: {
      address: "",
      city: "",
      dateOfBirth: "",
      dni: "",
      email: "",
      firstName: "",
      lastName: "",
      state: "",
      zipCode: ""
    },
    resolver: standardSchemaResolver(mxnKycSchema)
  });

  return (
    <Form {...form}>
      <FormShell onCancel={onCancel} onSubmit={form.handleSubmit(onSubmit)}>
        <NameAndBirth control={form.control} />
        <TextField control={form.control} label="Email" name="email" type="email" />
        <TextField control={form.control} label="CURP / INE number" name="dni" />
        <AddressFields control={form.control} />
      </FormShell>
    </Form>
  );
}

function ColKycForm({ onSubmit, onCancel }: Omit<KycFormScreenProps, "country">) {
  const form = useForm<ColKycFormValues>({
    defaultValues: {
      address: "",
      city: "",
      dateOfBirth: "",
      dni: "",
      firstName: "",
      lastName: "",
      phoneNumber: "",
      state: "",
      typeDocumentCol: AlfredpayColombiaDocumentType.CC,
      zipCode: ""
    },
    resolver: standardSchemaResolver(colKycSchema)
  });

  return (
    <Form {...form}>
      <FormShell onCancel={onCancel} onSubmit={form.handleSubmit(onSubmit)}>
        <NameAndBirth control={form.control} />
        <FormField
          control={form.control}
          name="typeDocumentCol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Document type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={AlfredpayColombiaDocumentType.CC}>Cédula de ciudadanía (CC)</SelectItem>
                  <SelectItem value={AlfredpayColombiaDocumentType.CE}>Cédula de extranjería (CE)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <TextField control={form.control} label="Document number" name="dni" />
        <PhoneField
          control={form.control}
          label="Phone number"
          name="phoneNumber"
          normalise={toColPhoneNumber}
          placeholder="573000000000"
        />
        <AddressFields control={form.control} />
      </FormShell>
    </Form>
  );
}

function ArKycForm({ onSubmit, onCancel }: Omit<KycFormScreenProps, "country">) {
  const form = useForm<ArKycFormValues>({
    defaultValues: {
      ...AR_KYC_DEFAULTS,
      address: "",
      city: "",
      dateOfBirth: "",
      dni: "",
      email: "",
      firstName: "",
      lastName: "",
      phoneNumber: "",
      state: "",
      zipCode: ""
    },
    resolver: standardSchemaResolver(arKycSchema)
  });

  return (
    <Form {...form}>
      <FormShell onCancel={onCancel} onSubmit={form.handleSubmit(onSubmit)}>
        <NameAndBirth control={form.control} />
        <TextField control={form.control} label="Email" name="email" type="email" />
        <PhoneField
          control={form.control}
          label="Phone number"
          name="phoneNumber"
          normalise={toArPhoneNumber}
          placeholder="91112345678"
        />
        <FormField
          control={form.control}
          name="typeDocumentAr"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Document type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={AlfredpayArgentinaDocumentType.DNI}>DNI</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <TextField control={form.control} label="DNI" name="dni" />
        <TextField control={form.control} label="CUIT (optional)" name="cuit" placeholder="11 digits" />
        <AddressFields control={form.control} />
        <FormField
          control={form.control}
          name="pep"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-3">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="font-normal">I am a politically exposed person</FormLabel>
            </FormItem>
          )}
        />
      </FormShell>
    </Form>
  );
}

export function KycFormScreen({ country, onSubmit, onCancel }: KycFormScreenProps) {
  if (country === "MX") {
    return <MxKycForm onCancel={onCancel} onSubmit={onSubmit} />;
  }
  if (country === "CO") {
    return <ColKycForm onCancel={onCancel} onSubmit={onSubmit} />;
  }
  return <ArKycForm onCancel={onCancel} onSubmit={onSubmit} />;
}
