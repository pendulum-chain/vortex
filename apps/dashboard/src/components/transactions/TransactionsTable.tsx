import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CORRIDORS } from "@/domain/corridors";
import { TX_STATUS_META } from "@/domain/status";
import type { Transaction } from "@/domain/types";

export function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Corridor</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Counterparty</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map(tx => {
          const corridor = CORRIDORS[tx.corridorId];
          const status = TX_STATUS_META[tx.status];
          return (
            <TableRow key={tx.id}>
              <TableCell className="font-medium">
                {corridor.flag} {corridor.name}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">
                    {tx.fromAmount} {tx.fromCurrency}
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">
                    {tx.toAmount} {tx.toCurrency}
                  </span>
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">{tx.counterparty}</TableCell>
              <TableCell>
                <Badge variant={status.badgeVariant}>{status.label}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(tx.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
