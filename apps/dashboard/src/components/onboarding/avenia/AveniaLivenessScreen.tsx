import { ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface AveniaLivenessScreenProps {
  isRefreshing: boolean;
  isOpened: boolean;
  livenessUrl?: string;
  onBack: () => void;
  onDone: () => void;
  onOpen: () => void;
  onRefresh: () => void;
}

export function AveniaLivenessScreen({
  isOpened,
  isRefreshing,
  livenessUrl,
  onBack,
  onDone,
  onOpen,
  onRefresh
}: AveniaLivenessScreenProps) {
  const openLiveness = () => {
    if (!livenessUrl) return;
    onOpen();
    window.open(livenessUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div className="grid gap-4 py-2">
        <div>
          <h3 className="font-medium text-sm">Face verification</h3>
          <p className="text-muted-foreground text-sm">
            Open Avenia's liveness check in a new tab, then return here after completing it.
          </p>
        </div>

        <div className="min-w-0 max-w-full overflow-hidden rounded-lg border bg-muted/30 p-4">
          <div className="flex min-w-0 max-w-full items-start gap-3 overflow-hidden">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="font-medium text-sm">Avenia liveness link</p>
              <p className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground text-xs">
                {isRefreshing ? "Refreshing liveness link..." : (livenessUrl ?? "No liveness link is available yet.")}
              </p>
            </div>
          </div>
          <div className="mt-4 grid min-w-0 max-w-full gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {isOpened ? (
              <Button
                className="w-full min-w-0 shrink whitespace-normal"
                disabled={isRefreshing}
                onClick={onDone}
                type="button"
              >
                <ShieldCheck className="size-4" />
                I've verified
              </Button>
            ) : (
              <Button
                className="w-full min-w-0 shrink whitespace-normal"
                disabled={!livenessUrl || isRefreshing}
                onClick={openLiveness}
                type="button"
              >
                <ExternalLink className="size-4" />
                Open face verification
              </Button>
            )}
            {isOpened && (
              <Button
                className="w-full min-w-0 shrink whitespace-normal"
                disabled={!livenessUrl || isRefreshing}
                onClick={openLiveness}
                type="button"
                variant="outline"
              >
                <ExternalLink className="size-4" />
                Open again
              </Button>
            )}
            <Button
              className="w-full min-w-0 shrink whitespace-normal"
              disabled={isRefreshing}
              onClick={onRefresh}
              type="button"
              variant="outline"
            >
              {isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh link
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button disabled={isRefreshing} onClick={onBack} variant="ghost">
          Back
        </Button>
        {!isOpened && <Button disabled>I've verified</Button>}
      </DialogFooter>
    </>
  );
}
