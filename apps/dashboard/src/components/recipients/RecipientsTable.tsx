import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CORRIDORS, PROVIDER_LABEL } from "@/domain/corridors";
import { recipientLabel } from "@/domain/recipient";
import { RECIPIENT_STATUS_META } from "@/domain/status";
import { PAYMENT_METHOD_LABEL } from "@/domain/transfer";
import type { Recipient } from "@/domain/types";
import { RecipientActionsDialog } from "./RecipientActionsDialog";

const MotionRow = motion.create(TableRow);

export function RecipientsTable({ recipients }: { recipients: Recipient[] }) {
  const [selected, setSelected] = useState<Recipient | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Recipient</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Payout</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recipients.map((recipient, i) => {
            const corridor = CORRIDORS[recipient.corridorId];
            const status = RECIPIENT_STATUS_META[recipient.status];
            return (
              <MotionRow
                animate={{ opacity: 1, y: 0 }}
                className={recipient.isSelf ? undefined : "cursor-pointer"}
                initial={{ opacity: 0, y: 8 }}
                key={recipient.id}
                onClick={recipient.isSelf ? undefined : () => setSelected(recipient)}
                transition={{ bounce: 0, delay: Math.min(i, 10) * 0.04, duration: 0.4, type: "spring" }}
              >
                <TableCell>
                  <div className="grid gap-0.5">
                    <span className="font-medium">{recipientLabel(recipient)}</span>
                    <span className="text-muted-foreground text-xs capitalize">
                      {recipient.isSelf ? "Yourself" : recipient.recipientType}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {corridor.flag} {corridor.name}
                </TableCell>
                <TableCell>
                  <div className="grid gap-0.5">
                    <span className="font-medium">{recipient.payoutCurrency}</span>
                    <span className="max-w-[14rem] truncate text-muted-foreground text-xs">
                      {recipient.bankDetails.value
                        ? `${PAYMENT_METHOD_LABEL[recipient.bankDetails.method]} · ${recipient.bankDetails.value}`
                        : "Awaiting recipient details"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={status.badgeVariant}>{status.label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <RecipientAction provider={PROVIDER_LABEL[corridor.provider]} recipient={recipient} />
                </TableCell>
              </MotionRow>
            );
          })}
        </TableBody>
      </Table>
      {selected && <RecipientActionsDialog onOpenChange={open => !open && setSelected(null)} recipient={selected} />}
    </>
  );
}

function RecipientAction({ recipient, provider }: { recipient: Recipient; provider: string }) {
  const navigate = useNavigate();

  // Only your own payout accounts are sendable today.
  if (recipient.isSelf && recipient.status === "approved") {
    return (
      <Button onClick={() => navigate({ search: { recipient: recipient.id }, to: "/transfer" })} size="sm">
        Create transfer
        <ArrowRight />
      </Button>
    );
  }

  if (recipient.status === "approved") {
    return <span className="text-muted-foreground text-xs">Coming soon</span>;
  }

  if (recipient.status === "invite_sent") {
    return <span className="text-muted-foreground text-xs">Invite sent</span>;
  }

  if (recipient.status === "expired" || recipient.status === "rejected") {
    return <span className="text-muted-foreground text-xs">{RECIPIENT_STATUS_META[recipient.status].label}</span>;
  }

  return <span className="text-muted-foreground text-xs">Awaiting {provider} review</span>;
}
