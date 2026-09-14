import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clearManagedProfile, useManagedProfileSelection } from "@/stores/managed-profile.store";

const BLOCKED_MESSAGE = "Finish or cancel the current transfer signing step before changing profiles.";

export function ManagedProfileBanner() {
  const selection = useManagedProfileSelection();
  const navigate = useNavigate();

  if (!selection) return null;
  const label = selection.targetEmail || selection.externalSubjectId;

  function handleStop() {
    try {
      const stopped = clearManagedProfile();
      if (stopped === false) {
        toast.error("Profile change blocked", { description: BLOCKED_MESSAGE });
        return;
      }
      navigate({ to: "/managed-profiles" });
    } catch {
      toast.error("Profile change blocked", { description: BLOCKED_MESSAGE });
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-amber-300 border-b bg-amber-100 px-4 py-2 text-amber-950 text-sm">
      <span className="min-w-0 break-all">
        Acting for <strong>{label}</strong>
      </span>
      <Button
        className="border-amber-400 bg-amber-50 hover:bg-amber-200"
        onClick={handleStop}
        size="sm"
        type="button"
        variant="outline"
      >
        Stop acting
      </Button>
    </div>
  );
}
