import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CORRIDORS } from "@/domain/corridors";
import type { Corridor, SenderAccount } from "@/domain/types";
import { notifyRecipientInvited, notifyRecipientRegistered } from "@/lib/notify";
import { useDashboardStore } from "@/stores/dashboard.store";

const schema = z.object({
  corridorId: z.enum(["BR", "EU", "MX", "CO", "US", "AR"]),
  email: z.string().email("Enter a valid email")
});

type FormValues = z.infer<typeof schema>;

export function RecipientDialog({ account, approvedCorridors }: { account: SenderAccount; approvedCorridors: Corridor[] }) {
  const [open, setOpen] = useState(false);
  const addRecipient = useDashboardStore(state => state.addRecipient);
  const setRecipientStatus = useDashboardStore(state => state.setRecipientStatus);

  const form = useForm<FormValues>({
    defaultValues: { corridorId: approvedCorridors[0]?.id ?? "BR", email: "" },
    resolver: zodResolver(schema)
  });

  const disabled = approvedCorridors.length === 0;

  function onSubmit(values: FormValues) {
    const corridorName = CORRIDORS[values.corridorId].name;
    const id = addRecipient({ accountId: account.id, corridorId: values.corridorId, email: values.email });
    notifyRecipientInvited(values.email, corridorName);
    // Simulate the recipient completing their KYB after receiving the invite email.
    setTimeout(() => {
      setRecipientStatus(id, "registered");
      notifyRecipientRegistered(values.email, corridorName);
    }, 2500);
    form.reset({ corridorId: values.corridorId, email: "" });
    setOpen(false);
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus />
          Invite recipient
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a recipient</DialogTitle>
          <DialogDescription>
            We'll email a KYB invite to the recipient. They onboard themselves and can receive transfers once approved.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
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
                      {approvedCorridors.map(corridor => (
                        <SelectItem key={corridor.id} value={corridor.id}>
                          {corridor.flag} {corridor.name} · {corridor.currency}
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
