import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Copy, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CORRIDORS, PROVIDER_LABEL } from "@/domain/corridors";
import { inviteUrl, recipientLabel } from "@/domain/recipient";
import { RECIPIENT_STATUS_META } from "@/domain/status";
import { PAYMENT_METHOD_LABEL } from "@/domain/transfer";
import type { Recipient } from "@/domain/types";
import { notifyInviteCopied } from "@/lib/notify";
import { simulateRecipientOnboarding } from "@/lib/recipientFlow";
import { useDashboardStore } from "@/stores/dashboard.store";

const MotionRow = motion.create(TableRow);

export function RecipientsTable({ recipients }: { recipients: Recipient[] }) {
  return (
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
              initial={{ opacity: 0, y: 8 }}
              key={recipient.id}
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
                  <span className="font-medium">
                    {recipient.amount} {recipient.payoutCurrency}
                  </span>
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
                <RecipientAction
                  corridorName={corridor.name}
                  provider={PROVIDER_LABEL[corridor.provider]}
                  recipient={recipient}
                />
              </TableCell>
            </MotionRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function RecipientAction({
  recipient,
  corridorName,
  provider
}: {
  recipient: Recipient;
  corridorName: string;
  provider: string;
}) {
  const navigate = useNavigate();
  const setRecipientStatus = useDashboardStore(state => state.setRecipientStatus);
  const trackInviteCopy = useDashboardStore(state => state.trackInviteCopy);

  if (recipient.status === "approved") {
    return (
      <Button onClick={() => navigate({ search: { recipient: recipient.id }, to: "/transfer" })} size="sm">
        Create transfer
        <ArrowRight />
      </Button>
    );
  }

  if (recipient.status === "invite_sent") {
    return (
      <Button
        onClick={() => {
          navigator.clipboard?.writeText(inviteUrl(recipient.inviteCode));
          trackInviteCopy(recipient.id);
          notifyInviteCopied();
        }}
        size="sm"
        variant="outline"
      >
        <Copy />
        Copy invite link
      </Button>
    );
  }

  if (recipient.status === "rejected") {
    return (
      <Button
        onClick={() => {
          setRecipientStatus(recipient.id, "pending");
          simulateRecipientOnboarding(recipient.id, corridorName);
        }}
        size="sm"
        variant="outline"
      >
        <RotateCcw />
        Retry
      </Button>
    );
  }

  return <span className="text-muted-foreground text-xs">Awaiting {provider} review</span>;
}
