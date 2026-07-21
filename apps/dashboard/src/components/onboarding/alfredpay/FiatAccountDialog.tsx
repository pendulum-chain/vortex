import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { AlfredpayFiatAccount } from "@vortexfi/shared";
import { ArrowLeft, Landmark, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type AlfredpayCorridorId,
  buildFiatAccountSchema,
  FIAT_ACCOUNT_CONFIG,
  fiatAccountDefaultValues,
  toAddFiatAccountRequest
} from "@/domain/fiatAccounts";
import { useAddFiatAccount } from "@/hooks/useFiatAccounts";
import { isApiError } from "@/services/api/api-client";

export type FiatAccountDialogView = "form" | "list";

interface FiatAccountDialogProps {
  accounts: AlfredpayFiatAccount[];
  corridorId: AlfredpayCorridorId;
  onOpenChange: (open: boolean) => void;
  onViewChange: (view: FiatAccountDialogView) => void;
  open: boolean;
  view: FiatAccountDialogView;
}

export function FiatAccountDialog({ accounts, corridorId, onOpenChange, onViewChange, open, view }: FiatAccountDialogProps) {
  const config = FIAT_ACCOUNT_CONFIG[corridorId];
  const addFiatAccount = useAddFiatAccount(corridorId);
  const form = useForm<Record<string, string>>({
    defaultValues: fiatAccountDefaultValues(corridorId),
    resolver: standardSchemaResolver(buildFiatAccountSchema(corridorId))
  });

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      form.reset(fiatAccountDefaultValues(corridorId));
      addFiatAccount.reset();
    }
  }

  async function onSubmit(values: Record<string, string>) {
    try {
      await addFiatAccount.mutateAsync(toAddFiatAccountRequest(corridorId, values));
      form.reset(fiatAccountDefaultValues(corridorId));
      onViewChange("list");
      toast.success("Payout account added");
    } catch (error) {
      if (isApiError(error)) {
        for (const fieldError of error.data.fields ?? []) {
          if (config.fields.some(field => field.name === fieldError.field)) {
            form.setError(fieldError.field, { message: fieldError.message });
          }
        }
        form.setError("root.server", { message: error.message || "Could not add payout account" });
      } else {
        form.setError("root.server", { message: "Could not add payout account" });
      }
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        {view === "list" ? (
          <>
            <DialogHeader>
              <DialogTitle>Payout accounts</DialogTitle>
              <DialogDescription>
                Accounts available for receiving money through {config.methodLabel}. Payout accounts are not needed for onramps
                or payments to third-party recipients.
              </DialogDescription>
            </DialogHeader>
            <ul className="grid max-h-[55vh] gap-2 overflow-y-auto py-1">
              {accounts.map(account => (
                <li className="flex items-center gap-3 rounded-lg border p-3" key={account.fiatAccountId}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Landmark className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                      {account.accountName || "Payout account"} · ••••{account.accountNumber.slice(-4)}
                    </p>
                    <p className="text-muted-foreground text-xs">{config.methodLabel}</p>
                  </div>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button onClick={() => onViewChange("form")} type="button">
                <Plus />
                Add another account
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add payout account</DialogTitle>
              <DialogDescription>
                This account enables reception of money through offramps. Onramps and payments to third-party recipients work
                without one.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
                <div className="grid max-h-[55vh] gap-4 overflow-y-auto py-1 pr-1">
                  {config.fields.map(field => (
                    <FormField
                      control={form.control}
                      key={field.name}
                      name={field.name}
                      render={({ field: formField }) => (
                        <FormItem>
                          <FormLabel>{field.label}</FormLabel>
                          {field.type === "select" ? (
                            <Select onValueChange={formField.onChange} value={formField.value}>
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select an account type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {field.options?.map(option => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <FormControl>
                              <Input
                                autoComplete={field.name === "accountName" ? "name" : "off"}
                                inputMode={
                                  field.name === "routingNumber" || (field.name === "accountNumber" && corridorId !== "AR")
                                    ? "numeric"
                                    : undefined
                                }
                                maxLength={field.name === "routingNumber" ? 9 : field.name === "accountNumber" ? 34 : 100}
                                placeholder={field.placeholder}
                                {...formField}
                              />
                            </FormControl>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                  {form.formState.errors.root?.server && (
                    <p className="text-destructive text-sm" role="alert">
                      {form.formState.errors.root.server.message}
                    </p>
                  )}
                </div>
                <DialogFooter>
                  {accounts.length > 0 && (
                    <Button onClick={() => onViewChange("list")} type="button" variant="ghost">
                      <ArrowLeft />
                      Back
                    </Button>
                  )}
                  <Button disabled={addFiatAccount.isPending} type="submit">
                    {addFiatAccount.isPending ? "Saving…" : "Save payout account"}
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
