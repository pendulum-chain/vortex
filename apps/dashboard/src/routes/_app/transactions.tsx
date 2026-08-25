import { createFileRoute, Link } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";
import { ArrowRight, Receipt } from "lucide-react";
import { motion } from "motion/react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useRecipients } from "@/hooks/useRecipients";
import { useTransactions } from "@/hooks/useTransactions";
import { popIn } from "@/lib/motion";
import { transferActor } from "@/machines/transferActor";

export const Route = createFileRoute("/_app/transactions")({
  component: TransactionsPage
});

function TransactionsPage() {
  const account = useActiveAccount();
  const { transactions } = useTransactions(account);
  const { recipients } = useRecipients(account);
  const resumableRamp = useSelector(transferActor, snapshot =>
    snapshot.matches("AwaitingPayment") &&
    snapshot.context.meta?.ownerProfileId === snapshot.context.activeOwnerProfileId &&
    snapshot.context.meta.accountId === account?.id
      ? snapshot.context.ramp
      : null
  );

  if (!account) {
    return null;
  }

  const accountTransactions = [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hasApprovedRecipient = recipients.some(recipient => recipient.isSelf && recipient.status === "approved");

  return (
    <Stagger className="mx-auto grid max-w-5xl gap-6">
      <StaggerItem>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">Transactions</h1>
        <p className="text-muted-foreground">Pay-in and pay-out history for {account.name}.</p>
      </StaggerItem>

      {resumableRamp && (
        <StaggerItem>
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="grid gap-1">
                <p className="font-medium">Payment awaiting confirmation</p>
                <p className="text-muted-foreground text-sm">
                  Your payment instructions are saved until the payment window expires.
                </p>
              </div>
              <Button asChild>
                <Link search={{ mode: "onramp" }} to="/transfer">
                  Resume payment
                  <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </StaggerItem>
      )}

      {accountTransactions.length === 0 ? (
        <StaggerItem>
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <motion.span
                animate="show"
                className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
                initial="hidden"
                variants={popIn}
              >
                <Receipt className="size-5" />
              </motion.span>
              <div className="grid gap-1">
                <p className="font-medium">No transactions yet</p>
                <p className="text-pretty text-muted-foreground text-sm">
                  {hasApprovedRecipient
                    ? "Start a pay-in or pay an approved pay-out account and it will appear here."
                    : "Start a pay-in or approve a pay-out account to create your first transaction."}
                </p>
              </div>
              {hasApprovedRecipient ? (
                <Button asChild>
                  <Link to="/transfer">
                    Start a transfer
                    <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link search={{ mode: "onramp" }} to="/transfer">
                      Start a pay-in
                      <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/overview">Set up a pay-out account</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </StaggerItem>
      ) : (
        <StaggerItem>
          <Card>
            <CardContent>
              <TransactionsTable transactions={accountTransactions} />
            </CardContent>
          </Card>
        </StaggerItem>
      )}
    </Stagger>
  );
}
