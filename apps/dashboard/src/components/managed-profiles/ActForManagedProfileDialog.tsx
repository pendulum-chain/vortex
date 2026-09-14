import { useNavigate } from "@tanstack/react-router";
import { UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ManagedProfile } from "@/services/api/managed-profiles.service";
import { selectManagedProfile } from "@/stores/managed-profile.store";
import { toManagedProfileSelection } from "./managed-profile-ui";

const BLOCKED_MESSAGE = "Finish or cancel the current transfer signing step before changing profiles.";

export function ActForManagedProfileDialog({
  onOpenChange,
  profile
}: {
  onOpenChange: (open: boolean) => void;
  profile: ManagedProfile | null;
}) {
  const navigate = useNavigate();

  function onConfirm() {
    if (!profile) return;
    try {
      const selected = selectManagedProfile(toManagedProfileSelection(profile));
      if (selected === false) {
        toast.error("Profile change blocked", { description: BLOCKED_MESSAGE });
        return;
      }
      onOpenChange(false);
      navigate({ to: "/overview" });
    } catch {
      toast.error("Profile change blocked", { description: BLOCKED_MESSAGE });
    }
  }

  if (!profile) return null;
  const label = profile.contactEmail ?? profile.externalSubjectId;

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Act for {label}?</DialogTitle>
          <DialogDescription>
            The dashboard will show this profile's supported data and actions until you stop acting for it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button onClick={onConfirm} type="button">
            <UserRoundCheck />
            Act for this profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
