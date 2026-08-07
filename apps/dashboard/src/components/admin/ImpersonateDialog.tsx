import { useNavigate } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStartImpersonation } from "@/hooks/useAdminConsole";
import { enterImpersonation } from "@/stores/impersonation.store";

/**
 * "Log in as" confirmation: swaps the active session to the returned impersonation token
 * and lands on Overview. The session itself is audited server-side against the operator.
 */
export function ImpersonateDialog({
  onOpenChange,
  target
}: {
  onOpenChange: (open: boolean) => void;
  target: { id: string; email: string } | null;
}) {
  const navigate = useNavigate();
  const startImpersonation = useStartImpersonation();

  function handleOpenChange(open: boolean) {
    onOpenChange(open);
    if (!open) {
      startImpersonation.reset();
    }
  }

  function onConfirm() {
    if (!target) return;
    startImpersonation.mutate(
      { targetProfileId: target.id },
      {
        onError: error => {
          toast.error("Could not start the impersonation session", {
            description: error instanceof Error ? error.message : undefined
          });
        },
        onSuccess: response => {
          enterImpersonation({
            expiresAt: response.expiresAt,
            sessionId: response.sessionId,
            targetEmail: response.target.email,
            token: response.token
          });
          handleOpenChange(false);
          navigate({ to: "/overview" });
        }
      }
    );
  }

  if (!target) return null;

  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log in as {target.email}?</DialogTitle>
          <DialogDescription>
            You'll act as this customer until the session expires in 30 minutes. This is logged against your account.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={startImpersonation.isPending} onClick={onConfirm} type="button">
            <LogIn />
            {startImpersonation.isPending ? "Starting…" : "Log in as customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
