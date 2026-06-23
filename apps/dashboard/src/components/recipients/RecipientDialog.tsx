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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CORRIDORS } from "@/domain/corridors";
import type { Corridor, SenderAccount } from "@/domain/types";
import { notifyRecipientRegistered } from "@/lib/notify";
import { useDashboardStore } from "@/stores/dashboard.store";

const schema = z.object({
  corridorId: z.enum(["BR", "EU", "MX", "CO", "US", "AR"]),
  destination: z.string().min(4, "Enter a valid destination"),
  name: z.string().min(2, "Enter the recipient's name")
});

type FormValues = z.infer<typeof schema>;

export function RecipientDialog({ account, approvedCorridors }: { account: SenderAccount; approvedCorridors: Corridor[] }) {
  const [open, setOpen] = useState(false);
  const addRecipient = useDashboardStore(state => state.addRecipient);
  const setRecipientStatus = useDashboardStore(state => state.setRecipientStatus);

  const form = useForm<FormValues>({
    defaultValues: { corridorId: approvedCorridors[0]?.id ?? "BR", destination: "", name: "" },
    resolver: zodResolver(schema)
  });

  const selectedCorridor = CORRIDORS[form.watch("corridorId")];
  const disabled = approvedCorridors.length === 0;

  function onSubmit(values: FormValues) {
    const id = addRecipient({
      accountId: account.id,
      corridorId: values.corridorId,
      destination: values.destination,
      name: values.name
    });
    // Simulate the provider confirming the registration shortly after submission.
    setTimeout(() => {
      setRecipientStatus(id, "registered");
      notifyRecipientRegistered(values.name, CORRIDORS[values.corridorId].name);
    }, 1500);
    form.reset({ corridorId: values.corridorId, destination: "", name: "" });
    setOpen(false);
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus />
          Register recipient
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a recipient</DialogTitle>
          <DialogDescription>
            Add a destination account for {account.name}. Only approved corridors are available.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="corridorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Corridor</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a corridor" />
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient name</FormLabel>
                  <FormControl>
                    <Input placeholder="Hanseatic Trade GmbH" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="destination"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{selectedCorridor.recipientLabel}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={
                        selectedCorridor.recipientMethod === "pix" ? "user@bank.com.br" : "DE89 3704 0044 0532 0130 00"
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {selectedCorridor.recipientMethod === "pix"
                      ? "PIX key — email, phone, CPF/CNPJ or random key."
                      : "International Bank Account Number."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button onClick={() => setOpen(false)} type="button" variant="ghost">
                Cancel
              </Button>
              <Button type="submit">Register</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
