import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Copy, Link2, Plus, User } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CORRIDORS, isCorridorAvailableForAccountType } from "@/domain/corridors";
import { inviteUrl } from "@/domain/recipient";
import type { AccountType, Corridor, CorridorId, SenderAccount } from "@/domain/types";
import { useOnboardingStatusQuery } from "@/hooks/useApprovedCorridors";
import { RECIPIENTS_QUERY_KEY } from "@/hooks/useRecipients";
import { notifyInviteCopied, notifyInviteLinkReady } from "@/lib/notify";
import { CORRIDOR_COUNTRY, CORRIDOR_RAIL } from "@/services/api/mappers";
import { RecipientsService } from "@/services/api/recipients.service";

const bpsSchema = z.coerce
  .number("Enter a whole number of bps")
  .int("Enter a whole number of bps")
  .min(0, "Must be 0 or more")
  .max(1000, "At most 1000 bps");

const schema = z.object({
  alias: z.string().trim().min(1, "Enter a name for this link").max(100, "Keep it under 100 characters"),
  buyBps: bpsSchema,
  corridorId: z.enum(["BR", "EU", "MX", "CO", "US", "AR"]),
  recipientType: z.enum(["individual", "company"]),
  sellBps: bpsSchema
});

type FormValues = z.infer<typeof schema>;

interface CreatedInvite {
  id: string;
  url: string;
  corridorName: string;
}

export function RecipientDialog({
  account,
  corridors,
  defaultCorridorId
}: {
  account: SenderAccount;
  corridors: Corridor[];
  defaultCorridorId?: CorridorId;
}) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    defaultValues: {
      alias: "",
      buyBps: 0,
      corridorId: defaultCorridorId ?? corridors[0]?.id ?? "BR",
      recipientType: "individual",
      sellBps: 0
    },
    resolver: standardSchemaResolver(schema)
  });

  // Only discount managers see (and may submit) the per-invite discount fields.
  const { data: onboardingStatus } = useOnboardingStatusQuery();
  const isDiscountManager = onboardingStatus?.roles?.includes("discount_manager") ?? false;

  const corridorId = form.watch("corridorId");
  const recipientType = form.watch("recipientType");
  const corridor = CORRIDORS[corridorId];
  // Not every corridor supports both recipient types (e.g. Alfredpay has no AR company KYB).
  const selectableCorridors = corridors.filter(option => isCorridorAvailableForAccountType(option.id, recipientType));
  const disabled = corridors.length === 0;

  const createInvite = useMutation({
    mutationFn: (values: FormValues) =>
      RecipientsService.createInvite({
        alias: values.alias,
        country: CORRIDOR_COUNTRY[values.corridorId],
        inviteeType: values.recipientType === "company" ? "business" : "individual",
        payoutCurrency: CORRIDOR_RAIL[values.corridorId],
        rail: CORRIDOR_RAIL[values.corridorId],
        ...(isDiscountManager && (values.buyBps > 0 || values.sellBps > 0)
          ? { discounts: { buyBps: values.buyBps, sellBps: values.sellBps } }
          : {})
      }),
    onError: error => {
      toast.error("Could not create the invite", { description: error instanceof Error ? error.message : undefined });
    },
    onSuccess: (invite, values) => {
      const selected = CORRIDORS[values.corridorId];
      notifyInviteLinkReady(selected.name);
      // Show the new invite as a pending recipient the moment it's created.
      queryClient.invalidateQueries({ queryKey: RECIPIENTS_QUERY_KEY });
      setCreated({ corridorName: selected.name, id: invite.id, url: inviteUrl(invite.token, values.corridorId) });
    }
  });

  function onSubmit(values: FormValues) {
    createInvite.mutate(values);
  }

  function reset() {
    setCreated(null);
    form.reset({
      alias: "",
      buyBps: 0,
      corridorId: form.getValues("corridorId"),
      recipientType: form.getValues("recipientType"),
      sellBps: 0
    });
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
                Choose who you're paying and name the link. We'll generate an invite link you send them yourself — they complete
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
                      <Tabs
                        onValueChange={value => {
                          const nextType = value as AccountType;
                          field.onChange(nextType);
                          if (!isCorridorAvailableForAccountType(form.getValues("corridorId"), nextType)) {
                            const fallback = corridors.find(option => isCorridorAvailableForAccountType(option.id, nextType));
                            if (fallback) {
                              form.setValue("corridorId", fallback.id);
                            }
                          }
                        }}
                        value={field.value}
                      >
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
                            {selectableCorridors.map(option => (
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
                    name="alias"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Alias</FormLabel>
                        <FormControl>
                          <Input placeholder={`e.g. Maria · ${corridor.currency}`} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {isDiscountManager && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="buyBps"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Buy discount (bps)</FormLabel>
                          <FormControl>
                            <Input max={1000} min={0} step={1} type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sellBps"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sell discount (bps)</FormLabel>
                          <FormControl>
                            <Input max={1000} min={0} step={1} type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <DialogFooter>
                  <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
                    Cancel
                  </Button>
                  <Button disabled={createInvite.isPending} type="submit">
                    <Link2 />
                    {createInvite.isPending ? "Creating…" : "Create invite link"}
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
  return (
    <>
      <DialogHeader>
        <DialogTitle>Invite link ready</DialogTitle>
        <DialogDescription>
          Send this {created.corridorName} link to your recipient. They'll complete KYC/KYB and add their payout details — then
          you can pay them.
        </DialogDescription>
      </DialogHeader>
      <InviteLinkCopy url={created.url} />
      <DialogFooter>
        <Button onClick={onDone} type="button">
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

/** The copyable invite-link block, shared by invite creation and the row management modal. */
export function InviteLinkCopy({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(url);
    notifyInviteCopied();
    setCopied(true);
  }

  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-muted-foreground text-xs">Invite link</span>
      <div
        className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md border bg-background p-2"
        data-testid="invite-link-preview"
      >
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{url}</code>
        <Button className="shrink-0" onClick={copy} size="sm" type="button" variant={copied ? "outline" : "default"}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
