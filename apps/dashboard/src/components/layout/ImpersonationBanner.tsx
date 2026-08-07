import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { exitImpersonation, useImpersonationSession } from "@/stores/impersonation.store";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Sticky, non-dismissible: an operator forgetting they are impersonating is the failure
 * mode this guards against. The timer only renders the remaining duration; storage changes
 * are subscribed through `useImpersonationSession`.
 */
export function ImpersonationBanner() {
  const session = useImpersonationSession();
  const navigate = useNavigate();
  const expiresAt = session?.expiresAt;
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!session) {
    return null;
  }

  function handleExit() {
    exitImpersonation();
    navigate({ to: "/admin" });
  }

  const remainingMs = new Date(session.expiresAt).getTime() - now;

  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 bg-warning px-4 py-2 text-sm text-warning-foreground">
      <span>
        You are acting as <strong>{session.targetEmail}</strong>
        <> · {formatRemaining(remainingMs)} remaining</>
      </span>
      <Button onClick={handleExit} size="sm" type="button" variant="outline">
        Exit
      </Button>
    </div>
  );
}
