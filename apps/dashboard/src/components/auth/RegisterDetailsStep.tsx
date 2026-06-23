import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, User } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { RegisterDetails } from "@/machines/register.machine";

const schema = z.object({
  accountType: z.enum(["company", "individual"]),
  email: z.string().email("Enter a valid email"),
  name: z.string().min(2, "Enter your name or company name"),
  terms: z.boolean().refine(value => value, { message: "Accept the terms to continue" })
});

type FormValues = z.infer<typeof schema>;

export function RegisterDetailsStep({ onSubmit }: { onSubmit: (details: RegisterDetails) => void }) {
  const form = useForm<FormValues>({
    defaultValues: { accountType: "company", email: "", name: "", terms: false },
    resolver: zodResolver(schema)
  });

  const accountType = form.watch("accountType");

  function handleSubmit(values: FormValues) {
    onSubmit({ accountType: values.accountType, email: values.email, name: values.name });
  }

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={form.handleSubmit(handleSubmit)}>
        <FormField
          control={form.control}
          name="accountType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account type</FormLabel>
              <div className="grid grid-cols-2 gap-2">
                <AccountTypeOption
                  hint="KYB"
                  icon={Building2}
                  label="Company"
                  onSelect={() => field.onChange("company")}
                  selected={accountType === "company"}
                />
                <AccountTypeOption
                  hint="KYC"
                  icon={User}
                  label="Individual"
                  onSelect={() => field.onChange("individual")}
                  selected={accountType === "individual"}
                />
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{accountType === "company" ? "Company name" : "Full name"}</FormLabel>
              <FormControl>
                <Input placeholder={accountType === "company" ? "Nordwind Logística Ltda" : "Maria Oliveira"} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input autoComplete="email" placeholder="you@company.com" type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="terms"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-start gap-2">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={value => field.onChange(value === true)} />
                </FormControl>
                <FormLabel className="font-normal text-muted-foreground text-sm leading-snug">
                  I agree to the Terms &amp; Conditions and Privacy Policy.
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit">
          Continue
        </Button>
      </form>
    </Form>
  );
}

function AccountTypeOption({
  icon: Icon,
  label,
  hint,
  selected,
  onSelect
}: {
  icon: typeof Building2;
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-2 rounded-md border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5 text-foreground" : "border-input hover:bg-accent"
      )}
      onClick={onSelect}
      type="button"
    >
      <Icon className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")} />
      <span className="grid leading-tight">
        <span className="font-medium text-sm">{label}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </span>
    </button>
  );
}
