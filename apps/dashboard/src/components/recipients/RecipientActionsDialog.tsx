import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dashboardInviteUrl, inviteUrl, recipientLabel } from "@/domain/recipient";
import type { Recipient } from "@/domain/types";
import { RECIPIENTS_QUERY_KEY } from "@/hooks/useRecipients";
import { RecipientsService } from "@/services/api/recipients.service";
import { InviteLinkCopy } from "./RecipientDialog";

/**
 * Row-click management modal: re-copy the invite link (only while the invite is pending
 * and its token is retained) and remove the entry from the list. Removal archives — the
 * link stays valid and the recipient can still complete KYC.
 */
export function RecipientActionsDialog({
  recipient,
  onOpenChange
}: {
  recipient: Recipient | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (target: Recipient): Promise<unknown> =>
      target.kind === "invitation"
        ? RecipientsService.archiveInvitation(target.id)
        : RecipientsService.archiveRecipient(target.id),
    onError: error => {
      toast.error("Could not remove the recipient", { description: error instanceof Error ? error.message : undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECIPIENTS_QUERY_KEY });
      onOpenChange(false);
    }
  });

  function handleOpenChange(open: boolean) {
    if (!open) {
      setConfirmingRemove(false);
    }
    onOpenChange(open);
  }

  if (!recipient) {
    return null;
  }

  const canRecopy = recipient.kind === "invitation" && recipient.status === "invite_sent" && recipient.inviteCode !== "";

  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{recipientLabel(recipient)}</DialogTitle>
          <DialogDescription>
            {canRecopy
              ? "Share the invite link again, or remove this recipient from your list."
              : "Remove this recipient from your list."}
          </DialogDescription>
        </DialogHeader>

        {canRecopy && (
          <InviteLinkCopy
            url={
              recipient.hasSeededDiscounts
                ? dashboardInviteUrl(recipient.inviteCode)
                : inviteUrl(recipient.inviteCode, recipient.corridorId)
            }
          />
        )}

        <p className="text-muted-foreground text-xs">
          {recipient.kind === "invitation"
            ? "Removing does not invalidate the invite link — the recipient can still open it and complete their verification."
            : "Removing only hides this recipient from your list — it does not block them or undo their verification."}
        </p>

        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} type="button" variant="ghost">
            Close
          </Button>
          <Button
            disabled={remove.isPending}
            onClick={() => (confirmingRemove ? remove.mutate(recipient) : setConfirmingRemove(true))}
            type="button"
            variant="destructive"
          >
            <Trash2 />
            {remove.isPending ? "Removing…" : confirmingRemove ? "Remove — are you sure?" : "Remove from list"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
