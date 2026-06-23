import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, Inbox } from "lucide-react";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Transaction } from "@/domain/types";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useDashboardStore } from "@/stores/dashboard.store";

export const Route = createFileRoute("/_app/transactions")({
  component: TransactionsPage
});

function TransactionsPage() {
  const account = useActiveAccount();
  const transactions = useDashboardStore(state => state.transactions);

  if (!account) {
    return null;
  }

  const accountTransactions = transactions
    .filter(tx => tx.accountId === account.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const onramps = accountTransactions.filter(tx => tx.direction === "onramp");
  const offramps = accountTransactions.filter(tx => tx.direction === "offramp");

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Transactions</h1>
        <p className="text-muted-foreground">On-ramp and off-ramp history for {account.name}.</p>
      </div>

      <Tabs defaultValue="onramp">
        <TabsList>
          <TabsTrigger value="onramp">
            <ArrowDownToLine />
            On-ramp
          </TabsTrigger>
          <TabsTrigger value="offramp">
            <ArrowUpFromLine />
            Off-ramp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="onramp">
          <TransactionsPanel emptyHint="Fiat-to-stablecoin transfers will appear here." transactions={onramps} />
        </TabsContent>
        <TabsContent value="offramp">
          <TransactionsPanel emptyHint="Stablecoin-to-fiat payouts will appear here." transactions={offramps} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TransactionsPanel({ transactions, emptyHint }: { transactions: Transaction[]; emptyHint: string }) {
  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Inbox className="size-7 text-muted-foreground" />
          <p className="font-medium">No transactions yet</p>
          <p className="text-muted-foreground text-sm">{emptyHint}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <TransactionsTable transactions={transactions} />
      </CardContent>
    </Card>
  );
}
