import { createFileRoute, Link } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_app/transactions")({
  component: TransactionsPage
});

function TransactionsPage() {
  const account = useActiveAccount();
  const { transactions } = useTransactions(account);
  const { recipients } = useRecipients(account);

  if (!account) {
    return null;
  }

  const accountTransactions = [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hasApprovedRecipient = recipients.some(recipient => recipient.isSelf && recipient.status === "approved");

  return (
    <Stagger className="mx-auto grid max-w-5xl gap-6">
      <StaggerItem>
        <h1 className="text-balance font-semibold text-2xl tracking-tight">Transactions</h1>
        <p className="text-muted-foreground">Onramp and offramp history for {account.name}.</p>
      </StaggerItem>

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
                    ? "Start an onramp or pay an approved payout account and it will appear here."
                    : "Start an onramp or approve a payout account to create your first transaction."}
                </p>
              </div>
              <Button asChild>
                <Link to={hasApprovedRecipient ? "/transfer" : "/recipients"}>
                  {hasApprovedRecipient ? "Start a transfer" : "Go to Recipients"}
                  <ArrowRight />
                </Link>
              </Button>
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
