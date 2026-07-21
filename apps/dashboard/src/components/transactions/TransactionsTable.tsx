import { LifeBuoy } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CORRIDORS } from "@/domain/corridors";
import { TX_STATUS_META } from "@/domain/status";
import { shortenAddress, TRANSFER_NETWORKS } from "@/domain/transfer";
import type { Transaction } from "@/domain/types";

const MotionRow = motion.create(TableRow);

/** A live-status dot with an expanding ping halo — signals the demo is actively settling this row. */
function LiveDot({ className }: { className: string }) {
  return (
    <span className="relative flex size-1.5 shrink-0">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${className}`} />
      <span className={`relative inline-flex size-1.5 rounded-full ${className}`} />
    </span>
  );
}

function networkLabel(id: string): string {
  return TRANSFER_NETWORKS.find(network => network.id === id)?.label ?? id;
}

/** Awaiting/processing are live states the demo settles on a timer — show a pulsing indicator. */
const LIVE_DOT: Partial<Record<Transaction["status"], string>> = {
  awaiting_payin: "bg-warning",
  processing: "bg-info"
};

export function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Created at</TableHead>
          <TableHead>Direction</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead>Amount sent</TableHead>
          <TableHead>Amount received</TableHead>
          <TableHead>Country / currency</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx, i) => {
          const corridor = CORRIDORS[tx.corridorId];
          const status = TX_STATUS_META[tx.status];
          const dot = LIVE_DOT[tx.status];
          return (
            <MotionRow
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 8 }}
              key={tx.id}
              transition={{ bounce: 0, delay: Math.min(i, 10) * 0.04, duration: 0.4, type: "spring" }}
            >
              <TableCell className="text-muted-foreground">
                {new Date(tx.createdAt).toLocaleString(undefined, {
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  month: "short"
                })}
              </TableCell>
              <TableCell className="font-medium">{tx.direction === "BUY" ? "Onramp" : "Offramp"}</TableCell>
              <TableCell>
                <div className="grid gap-0.5">
                  <code className="font-mono text-xs">
                    {tx.payinWallet ? shortenAddress(tx.payinWallet) : tx.recipientEmail}
                  </code>
                  <span className="text-muted-foreground text-xs">{networkLabel(tx.payinNetwork)}</span>
                </div>
              </TableCell>
              <TableCell>
                <span className="font-medium">
                  {tx.amountIn} {tx.amountInToken}
                </span>
              </TableCell>
              <TableCell>
                <span className="font-medium">
                  {tx.fiatPayoutAmount} {tx.payoutCurrency}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {corridor.flag} {corridor.name} · {corridor.currency}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  {dot && <LiveDot className={dot} />}
                  <Badge variant={status.badgeVariant}>{status.label}</Badge>
                </span>
              </TableCell>
              <TableCell className="text-right">
                {tx.status === "failed" ? (
                  <FailedAction reason={tx.failureReason} recipientEmail={tx.recipientEmail} />
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
            </MotionRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function FailedAction({ reason, recipientEmail }: { reason?: string; recipientEmail: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={() =>
            toast.success("Support request opened", { description: `We'll email you about the ${recipientEmail} payout.` })
          }
          size="sm"
          variant="outline"
        >
          <LifeBuoy />
          Get help
        </Button>
      </TooltipTrigger>
      <TooltipContent>{reason ?? "This payout failed. Contact support to resolve it."}</TooltipContent>
    </Tooltip>
  );
}
