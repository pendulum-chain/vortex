import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Globe2, Lock } from "lucide-react";
import { motion } from "motion/react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { OnrampForm } from "@/components/transfer/OnrampForm";
import { TransferForm } from "@/components/transfer/TransferForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type CorridorId, corridorIdSchema } from "@/domain/types";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useRecipients } from "@/hooks/useRecipients";
import { popIn } from "@/lib/motion";

type TransferMode = "offramp" | "onramp" | "cross-border";

interface TransferSearch {
  amount?: string;
  corridorId?: CorridorId;
  mode?: TransferMode;
  network?: string;
  recipient?: string;
  token?: string;
}

export const Route = createFileRoute("/_app/transfer")({
  component: TransferPage,
  validateSearch: (search: Record<string, unknown>): TransferSearch => ({
    // Onramp prefill, carried over from the quote page.
    amount: typeof search.amount === "string" ? search.amount : undefined,
    // Parsed, not cast: a hand-edited corridor would otherwise reach CORRIDORS[...] unchecked.
    corridorId: corridorIdSchema.optional().catch(undefined).parse(search.corridorId),
    mode: search.mode === "onramp" || search.mode === "cross-border" || search.mode === "offramp" ? search.mode : "offramp",
    network: typeof search.network === "string" ? search.network : undefined,
    recipient: typeof search.recipient === "string" ? search.recipient : undefined,
    token: typeof search.token === "string" ? search.token : undefined
  })
});

function TransferPage() {
  const account = useActiveAccount();
  const navigate = useNavigate({ from: Route.fullPath });
  const { amount, corridorId, mode: searchMode, network, recipient, token } = Route.useSearch();
  const mode = searchMode ?? "offramp";
  const { recipients } = useRecipients(account);

  if (!account) {
    return null;
  }

  // Only self-recipients are sendable today — third-party sending is not yet available.
  const hasApproved = recipients.some(item => item.isSelf && item.status === "approved");
  const hasAnyRecipient = recipients.length > 0;

  return (
    <Stagger className="mx-auto grid max-w-xl gap-6">
      <StaggerItem>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">New transfer</h1>
        <p className="text-pretty text-muted-foreground">
          {mode === "offramp"
            ? "Convert stablecoins into fiat through an approved payout account."
            : mode === "onramp"
              ? "Pay with fiat and receive tokens in an EVM wallet."
              : "Send money directly across borders."}
        </p>
      </StaggerItem>

      <StaggerItem>
        <Tabs
          onValueChange={value =>
            navigate({
              search: previous => ({ ...previous, mode: value as TransferMode, recipient: undefined })
            })
          }
          value={mode}
        >
          <TabsList className="grid h-11 w-full grid-cols-3">
            <TabsTrigger value="offramp">Offramp</TabsTrigger>
            <TabsTrigger value="onramp">Onramp</TabsTrigger>
            <TabsTrigger value="cross-border">Cross-border</TabsTrigger>
          </TabsList>
        </Tabs>
      </StaggerItem>

      {mode === "onramp" ? (
        <StaggerItem>
          <Card>
            <CardHeader>
              <CardTitle>Onramp details</CardTitle>
            </CardHeader>
            <CardContent>
              <OnrampForm account={account} prefill={{ amount, corridorId, network, token }} />
            </CardContent>
          </Card>
        </StaggerItem>
      ) : mode === "cross-border" ? (
        <StaggerItem>
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Globe2 className="size-5" />
              </span>
              <div className="grid gap-1">
                <p className="font-medium">Cross-border transfers are coming soon</p>
                <p className="max-w-sm text-pretty text-muted-foreground text-sm">
                  You’ll be able to pay approved recipients directly across supported countries from here.
                </p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      ) : hasApproved ? (
        <StaggerItem>
          <Card>
            <CardHeader>
              <CardTitle>Transfer details</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Re-key on the recipient param so navigating to a fresh "New transfer" resets the form. */}
              <TransferForm
                account={account}
                key={recipient ?? "new"}
                preselectRecipientId={recipient}
                recipients={recipients}
              />
            </CardContent>
          </Card>
        </StaggerItem>
      ) : (
        <StaggerItem>
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <motion.span
                animate="show"
                className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
                initial="hidden"
                variants={popIn}
              >
                <Lock className="size-5" />
              </motion.span>
              <div className="grid gap-1">
                <p className="font-medium">No approved recipient yet</p>
                <p className="text-pretty text-muted-foreground text-sm">
                  {hasAnyRecipient
                    ? "A recipient is awaiting KYC/KYB approval. You can transfer to them once they're approved."
                    : "Add a recipient and wait for KYC/KYB approval, then you can pay them here."}
                </p>
              </div>
              <Button asChild>
                <Link to="/recipients">
                  Go to Recipients
                  <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </StaggerItem>
      )}
    </Stagger>
  );
}
