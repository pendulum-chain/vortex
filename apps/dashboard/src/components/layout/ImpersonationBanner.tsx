import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useImpersonationStore } from "@/stores/impersonation.store";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Sticky, non-dismissible: an operator forgetting they are impersonating is the failure
 * mode this guards against. Ticks every second both to show time remaining and to notice
 * a session api-client already cleared (expired token on a 401) so the banner drops itself.
 */
export function ImpersonationBanner() {
  const session = useImpersonationStore(state => state.session);
  const exit = useImpersonationStore(state => state.exit);
  const syncFromStorage = useImpersonationStore(state => state.syncFromStorage);
  const navigate = useNavigate();
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!session) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      syncFromStorage();
      setRemainingMs(new Date(session.expiresAt).getTime() - Date.now());
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session, syncFromStorage]);

  if (!session) {
    return null;
  }

  async function handleExit() {
    setExiting(true);
    try {
      await exit();
      navigate({ to: "/admin" });
    } finally {
      setExiting(false);
    }
  }

  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 bg-warning px-4 py-2 text-sm text-warning-foreground">
      <span>
        You are acting as <strong>{session.targetEmail}</strong>
        {remainingMs !== null && <> · {formatRemaining(remainingMs)} remaining</>}
      </span>
      <Button disabled={exiting} onClick={handleExit} size="sm" type="button" variant="outline">
        {exiting ? "Exiting…" : "Exit"}
      </Button>
    </div>
  );
}
