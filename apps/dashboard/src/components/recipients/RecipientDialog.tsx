import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Plus, User } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CORRIDORS } from "@/domain/corridors";
import type { AccountType, Corridor, SenderAccount } from "@/domain/types";
import { notifyRecipientInvited } from "@/lib/notify";
import { simulateRecipientOnboarding } from "@/lib/recipientFlow";
import { useDashboardStore } from "@/stores/dashboard.store";

const schema = z.object({
  amount: z.string().refine(value => Number(value) > 0, "Enter an amount"),
  bankValue: z.string().min(4, "Enter the payout details"),
  corridorId: z.enum(["BR", "EU", "MX", "CO", "US", "AR"]),
  email: z.string().email("Enter a valid email"),
  recipientType: z.enum(["individual", "company"])
});

type FormValues = z.infer<typeof schema>;

export function RecipientDialog({ account, approvedCorridors }: { account: SenderAccount; approvedCorridors: Corridor[] }) {
  const [open, setOpen] = useState(false);
  const addRecipient = useDashboardStore(state => state.addRecipient);

  const form = useForm<FormValues>({
    defaultValues: {
      amount: "",
      bankValue: "",
      corridorId: approvedCorridors[0]?.id ?? "BR",
      email: "",
      recipientType: "individual"
    },
    resolver: zodResolver(schema)
  });

  const corridorId = form.watch("corridorId");
  const corridor = CORRIDORS[corridorId];
  const disabled = approvedCorridors.length === 0;

  function onSubmit(values: FormValues) {
    const selected = CORRIDORS[values.corridorId];
    const id = addRecipient({
      accountId: account.id,
      amount: Number(values.amount).toFixed(2),
      bankDetails: { method: selected.recipientMethod, value: values.bankValue },
      corridorId: values.corridorId,
      email: values.email,
      payoutCurrency: selected.currency,
      recipientType: values.recipientType
    });
    notifyRecipientInvited(values.email, selected.name);
    simulateRecipientOnboarding(id, values.email, selected.name);
    form.reset({ amount: "", bankValue: "", corridorId: values.corridorId, email: "", recipientType: values.recipientType });
    setOpen(false);
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus />
          Add recipient
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a recipient</DialogTitle>
          <DialogDescription>
            Enter the recipient's payout details. We'll email them a KYC/KYB invite — they can receive transfers once approved.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="recipientType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient type</FormLabel>
                  <Tabs onValueChange={value => field.onChange(value as AccountType)} value={field.value}>
                    <TabsList className="w-full">
                      <TabsTrigger value="individual">
                        <User />
                        Individual
                      </TabsTrigger>
                      <TabsTrigger value="company">
                        <Building2 />
                        Company
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient email</FormLabel>
                  <FormControl>
                    <Input autoComplete="email" placeholder="recipient@company.com" type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="corridorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {approvedCorridors.map(option => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.flag} {option.name} · {option.currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payout amount ({corridor.currency})</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormDescription>How much this recipient receives per transfer.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="bankValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{corridor.recipientLabel}</FormLabel>
                  <FormControl>
                    <Input placeholder={`Enter ${corridor.recipientLabel}`} {...field} />
                  </FormControl>
                  <FormDescription>{corridor.name} payouts settle to this account.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button onClick={() => setOpen(false)} type="button" variant="ghost">
                Cancel
              </Button>
              <Button type="submit">Send invite</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
