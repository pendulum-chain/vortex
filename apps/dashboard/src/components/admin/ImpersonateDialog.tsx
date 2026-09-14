import { useNavigate } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStartImpersonation } from "@/hooks/useAdminConsole";
import { useAuthStore } from "@/stores/auth.store";
import { enterImpersonation, exitImpersonation } from "@/stores/impersonation.store";
import { selectManagedProfile } from "@/stores/managed-profile.store";
import { type AdminImpersonationTarget, canSelectManagedProfileDirectly } from "./admin-account-ui";

/** Confirms an impersonation or a direct managed-profile selection. */
export function ImpersonateDialog({
  onOpenChange,
  target
}: {
  onOpenChange: (open: boolean) => void;
  target: AdminImpersonationTarget | null;
}) {
  const navigate = useNavigate();
  const startImpersonation = useStartImpersonation();
  const authenticatedProfileId = useAuthStore(state => state.user?.userId);

  function handleOpenChange(open: boolean) {
    onOpenChange(open);
    if (!open) {
      startImpersonation.reset();
    }
  }

  function onConfirm() {
    if (!target) return;
    if (target.managedProfile && canSelectManagedProfileDirectly(target, authenticatedProfileId)) {
      if (!selectManagedProfile(target.managedProfile)) {
        toast.error("Finish the current transfer step before changing identity");
        return;
      }
      handleOpenChange(false);
      navigate({ to: "/overview" });
      return;
    }
    startImpersonation.mutate(
      { targetProfileId: target.id },
      {
        onError: error => {
          toast.error("Could not start the impersonation session", {
            description: error instanceof Error ? error.message : undefined
          });
        },
        onSuccess: response => {
          const entered = enterImpersonation({
            expiresAt: response.expiresAt,
            sessionId: response.sessionId,
            targetEmail: response.target.email,
            targetProfileId: response.target.id,
            token: response.token
          });
          if (!entered) {
            toast.error("Finish the current transfer step before changing identity");
            return;
          }
          if (target.managedProfile && !selectManagedProfile(target.managedProfile)) {
            exitImpersonation();
            toast.error("Finish the current transfer step before changing identity");
            return;
          }
          handleOpenChange(false);
          navigate({ to: "/overview" });
        }
      }
    );
  }

  if (!target) return null;
  const selectsDirectly = canSelectManagedProfileDirectly(target, authenticatedProfileId);

  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target.managedProfile ? `Act as ${target.label}?` : `Log in as ${target.label}?`}</DialogTitle>
          <DialogDescription>
            {selectsDirectly
              ? "You'll act for this managed profile using your current manager session. This is not an impersonation session."
              : `${
                  target.managedProfile
                    ? `You'll impersonate ${target.email}, this profile's manager, and act for the managed profile. `
                    : "You'll act as this customer until the session expires in 30 minutes. "
                }This is logged against your account, and money movement is disabled.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={startImpersonation.isPending} onClick={onConfirm} type="button">
            <LogIn />
            {startImpersonation.isPending ? "Starting…" : "Login as"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
