import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Check, Copy, KeyRound, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateApiCredential } from "@/hooks/useApiKeys";

const schema = z
  .object({
    customExpiresAt: z.string(),
    expiration: z.enum(["90", "365", "730", "custom"]),
    name: z.string().trim().min(1, "Enter a name for this credential").max(91, "Keep it under 92 characters")
  })
  .superRefine((values, context) => {
    if (values.expiration !== "custom") return;
    const expiresAt = new Date(`${values.customExpiresAt}T23:59:59.999Z`);
    if (!values.customExpiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      context.addIssue({ code: "custom", message: "Choose a future expiration date", path: ["customExpiresAt"] });
      return;
    }
    if (expiresAt.getTime() > Date.now() + 2 * 365 * 24 * 60 * 60 * 1000) {
      context.addIssue({ code: "custom", message: "Choose a date within two years", path: ["customExpiresAt"] });
    }
  });

type FormValues = z.infer<typeof schema>;

function expirationDate(values: FormValues): string {
  if (values.expiration === "custom") return new Date(`${values.customExpiresAt}T23:59:59.999Z`).toISOString();
  return new Date(Date.now() + Number(values.expiration) * 24 * 60 * 60 * 1000).toISOString();
}

export function CreateApiCredentialDialog() {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const createCredential = useCreateApiCredential();
  const form = useForm<FormValues>({
    defaultValues: { customExpiresAt: "", expiration: "365", name: "" },
    resolver: standardSchemaResolver(schema)
  });
  const expiration = form.watch("expiration");

  function reset() {
    createCredential.reset();
    form.reset();
    setAcknowledged(false);
  }

  function onOpenChange(next: boolean) {
    if (!next && createCredential.data && !acknowledged) {
      toast.warning("Save your secret key before closing");
      return;
    }
    setOpen(next);
    if (!next) reset();
  }

  function onSubmit(values: FormValues) {
    createCredential.mutate(
      { expiresAt: expirationDate(values), name: values.name.trim() },
      {
        onError: error => {
          toast.error("Could not create the API credential", {
            description: error instanceof Error ? error.message : undefined
          });
        }
      }
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Create credential
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl" showCloseButton={!createCredential.data || acknowledged}>
        {createCredential.data ? (
          <CreatedCredential
            acknowledged={acknowledged}
            onAcknowledgedChange={setAcknowledged}
            onDone={() => onOpenChange(false)}
            publicKey={createCredential.data.publicKey.key}
            secretKey={createCredential.data.secretKey.key}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create API credential</DialogTitle>
              <DialogDescription>
                Use this credential from a trusted server to authenticate Vortex SDK requests.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" placeholder="Production backend" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expiration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiration</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="90">90 days</SelectItem>
                          <SelectItem value="365">1 year</SelectItem>
                          <SelectItem value="730">2 years</SelectItem>
                          <SelectItem value="custom">Custom date</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {expiration === "custom" && (
                  <FormField
                    control={form.control}
                    name="customExpiresAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiration date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <p>The secret key will be shown once. Store it in a server-side secret manager, never in browser code.</p>
                </div>
                <DialogFooter>
                  <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
                    Cancel
                  </Button>
                  <Button disabled={createCredential.isPending} type="submit">
                    <KeyRound />
                    {createCredential.isPending ? "Creating..." : "Create credential"}
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

function CreatedCredential({
  acknowledged,
  onAcknowledgedChange,
  onDone,
  publicKey,
  secretKey
}: {
  acknowledged: boolean;
  onAcknowledgedChange: (checked: boolean) => void;
  onDone: () => void;
  publicKey: string;
  secretKey: string;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Save your credential</DialogTitle>
        <DialogDescription>The secret key cannot be retrieved after this dialog closes.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <CredentialValue label="Public key" value={publicKey} />
        <CredentialValue label="Secret key" secret value={secretKey} />
        <Label className="flex items-start gap-3 rounded-lg border p-3 font-normal" htmlFor="credential-saved">
          <Checkbox
            checked={acknowledged}
            id="credential-saved"
            onCheckedChange={checked => onAcknowledgedChange(checked === true)}
          />
          <span>
            <span className="block font-medium">I saved the secret key</span>
            <span className="text-muted-foreground text-xs">Closing permanently removes it from this page.</span>
          </span>
        </Label>
      </div>
      <DialogFooter>
        <Button disabled={!acknowledged} onClick={onDone} type="button">
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function CredentialValue({ label, secret = false, value }: { label: string; secret?: boolean; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy the ${label.toLowerCase()}`);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {secret && <span className="font-medium text-amber-600 text-xs">Shown once</span>}
      </div>
      <div className="flex gap-2">
        <Input aria-label={label} className="font-mono text-xs" readOnly value={value} />
        <Button aria-label={`Copy ${label.toLowerCase()}`} onClick={copy} size="icon" type="button" variant="outline">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}
