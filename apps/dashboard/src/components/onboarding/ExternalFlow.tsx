import { useMachine } from "@xstate/react";
import { CheckCircle2, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import type { Corridor, OnboardingKind, OnboardingRoute, OnboardingStatus } from "@/domain/types";
import { externalOnboardingMachine } from "@/machines/externalOnboarding.machine";

interface ExternalFlowProps {
  corridor: Corridor;
  kind: OnboardingKind;
  route: Extract<OnboardingRoute, "google_form" | "redirect">;
  onStatusChange: (status: OnboardingStatus) => void;
  onClose: () => void;
}

const COPY: Record<ExternalFlowProps["route"], { url: string; openLabel: string; confirmLabel: string; intro: string }> = {
  google_form: {
    confirmLabel: "I've submitted the form",
    intro:
      "EU company KYB is collected through an external Google Form. Open it, complete your company details, then confirm below.",
    openLabel: "Open Google Form",
    url: "https://docs.google.com/forms"
  },
  redirect: {
    confirmLabel: "I've completed it",
    intro:
      "USA onboarding is handled by our verification partner. You'll be redirected to their secure flow, then return here to confirm.",
    openLabel: "Continue to partner",
    url: "https://partner.vortex.fi/onboarding"
  }
};

export function ExternalFlow({ corridor, kind, route, onStatusChange, onClose }: ExternalFlowProps) {
  const [state, send] = useMachine(externalOnboardingMachine, { input: { onStatusChange } });
  const copy = COPY[route];

  const value = String(state.value);
  const isIntro = value === "intro";
  const isProcessing = value === "verifying" || value === "review";
  const isApproved = value === "approved";

  return (
    <>
      <div className="min-h-[200px] py-2">
        {isIntro && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              {route === "google_form" ? <FileText className="size-6" /> : <ExternalLink className="size-6" />}
            </span>
            <p className="max-w-sm text-muted-foreground text-sm">{copy.intro}</p>
            <Button asChild variant="outline">
              <a href={copy.url} rel="noreferrer" target="_blank">
                {copy.openLabel}
                <ExternalLink />
              </a>
            </Button>
          </div>
        )}

        {isProcessing && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <Loader2 className="size-8 animate-spin text-primary" />
            <div>
              <p className="font-medium">{value === "verifying" ? "Submitting your application" : "In review"}</p>
              <p className="text-muted-foreground text-sm">
                {value === "verifying"
                  ? "Sending your submission to the verification provider…"
                  : "The provider is reviewing your submission. We'll email you when it's done."}
              </p>
            </div>
          </div>
        )}

        {isApproved && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <CheckCircle2 className="size-10 text-success" />
            <div>
              <p className="font-medium">Approved</p>
              <p className="text-muted-foreground text-sm">
                {corridor.name} {kind.toUpperCase()} is complete. You can now register recipients.
              </p>
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        {isIntro && (
          <>
            <Button onClick={onClose} variant="ghost">
              Cancel
            </Button>
            <Button onClick={() => send({ type: "SUBMIT" })}>{copy.confirmLabel}</Button>
          </>
        )}
        {isProcessing && (
          <Button onClick={onClose} variant="outline">
            Continue in background
          </Button>
        )}
        {isApproved && <Button onClick={onClose}>Done</Button>}
      </DialogFooter>
    </>
  );
}
