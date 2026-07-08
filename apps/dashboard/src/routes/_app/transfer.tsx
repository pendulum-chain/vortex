import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Lock } from "lucide-react";
import { motion } from "motion/react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { TransferForm } from "@/components/transfer/TransferForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useRecipients } from "@/hooks/useRecipients";
import { popIn } from "@/lib/motion";

export const Route = createFileRoute("/_app/transfer")({
  component: TransferPage,
  validateSearch: (search: Record<string, unknown>): { recipient?: string } => ({
    recipient: typeof search.recipient === "string" ? search.recipient : undefined
  })
});

function TransferPage() {
  const account = useActiveAccount();
  const { recipient } = Route.useSearch();
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
        <p className="text-pretty text-muted-foreground">Pay an approved recipient by funding your Vortex wallet.</p>
      </StaggerItem>

      {hasApproved ? (
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
