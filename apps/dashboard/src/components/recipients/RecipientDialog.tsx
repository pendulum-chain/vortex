import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Check, Copy, Link2, Plus, User } from "lucide-react";
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
import { inviteUrl } from "@/domain/recipient";
import type { AccountType, Corridor, SenderAccount } from "@/domain/types";
import { notifyInviteCopied, notifyInviteLinkReady } from "@/lib/notify";
import { simulateRecipientOnboarding } from "@/lib/recipientFlow";
import { useDashboardStore } from "@/stores/dashboard.store";

const schema = z.object({
  amount: z.string().refine(value => Number(value) > 0, "Enter an amount"),
  corridorId: z.enum(["BR", "EU", "MX", "CO", "US", "AR"]),
  recipientType: z.enum(["individual", "company"])
});

type FormValues = z.infer<typeof schema>;

interface CreatedInvite {
  id: string;
  url: string;
  corridorName: string;
}

export function RecipientDialog({ account, approvedCorridors }: { account: SenderAccount; approvedCorridors: Corridor[] }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const addRecipient = useDashboardStore(state => state.addRecipient);

  const form = useForm<FormValues>({
    defaultValues: {
      amount: "",
      corridorId: approvedCorridors[0]?.id ?? "BR",
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
      corridorId: values.corridorId,
      payoutCurrency: selected.currency,
      recipientType: values.recipientType
    });
    const recipient = useDashboardStore.getState().recipients.find(item => item.id === id);
    if (!recipient) {
      return;
    }
    notifyInviteLinkReady(selected.name);
    // The recipient opens the link shortly and completes KYC/KYB in the mock.
    simulateRecipientOnboarding(id, selected.name);
    setCreated({ corridorName: selected.name, id, url: inviteUrl(recipient.inviteCode) });
  }

  function reset() {
    setCreated(null);
    form.reset({ amount: "", corridorId: form.getValues("corridorId"), recipientType: form.getValues("recipientType") });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus />
          Add recipient
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <InviteShare created={created} onDone={() => onOpenChange(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a recipient</DialogTitle>
              <DialogDescription>
                Choose who you're paying and how much. We'll generate an invite link you send them yourself — they complete
                KYC/KYB and add their payout details to receive transfers.
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
                        <FormLabel>I will send you ({corridor.currency})</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormDescription>You can change this per transfer later.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
                    Cancel
                  </Button>
                  <Button type="submit">
                    <Link2 />
                    Create invite link
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteShare({ created, onDone }: { created: CreatedInvite; onDone: () => void }) {
  const trackInviteCopy = useDashboardStore(state => state.trackInviteCopy);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(created.url);
    trackInviteCopy(created.id);
    notifyInviteCopied();
    setCopied(true);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invite link ready</DialogTitle>
        <DialogDescription>
          Send this {created.corridorName} link to your recipient. They'll complete KYC/KYB and add their payout details — then
          you can pay them.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <span className="text-muted-foreground text-xs">Invite link</span>
        <div className="flex items-center gap-2 rounded-md border bg-background p-2">
          <code className="flex-1 truncate font-mono text-xs">{created.url}</code>
          <Button onClick={copy} size="sm" type="button" variant={copied ? "outline" : "default"}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onDone} type="button">
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
