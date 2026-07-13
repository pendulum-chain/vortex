import { createMoneriumKycApi, createMoneriumKycMachine, type MoneriumCustomerType } from "@vortexfi/kyc";
import { useMachine } from "@xstate/react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import type { Corridor, OnboardingStatus } from "@/domain/types";
import { apiClient } from "@/services/api/api-client";

interface MoneriumKycFlowProps {
  corridor: Corridor;
  customerType: MoneriumCustomerType;
  onClose: () => void;
  onSettled: (status: OnboardingStatus) => void;
}

const moneriumKycMachine = createMoneriumKycMachine({
  api: createMoneriumKycApi(apiClient),
  openAuthorizationUrl: url => window.location.assign(url)
});

const STATUS_BY_STATE: Record<string, OnboardingStatus> = {
  Approved: "approved",
  InReview: "in_review",
  Rejected: "rejected"
};

export function MoneriumKycFlow({ corridor, customerType, onClose, onSettled }: MoneriumKycFlowProps) {
  const [state, send] = useMachine(moneriumKycMachine, { input: { customerType } });
  const value = String(state.value);
  const reported = useRef<OnboardingStatus | null>(null);

  useEffect(() => {
    const status = STATUS_BY_STATE[value];
    if (!status || reported.current === status) return;
    reported.current = status;
    onSettled(status);
  }, [onSettled, value]);

  if (value === "Routing" || value === "CheckingStatus" || value === "StartingAuthorization") {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-primary" />
        <div>
          <p className="font-medium">Connecting to Monerium</p>
          <p className="text-muted-foreground text-sm">Checking your secure onboarding status.</p>
        </div>
      </Centered>
    );
  }

  if (value === "Ready") {
    return (
      <>
        <Centered>
          <ShieldCheck className="size-10 text-primary" />
          <div>
            <p className="font-medium">Verify with Monerium</p>
            <p className="max-w-sm text-muted-foreground text-sm">
              Monerium will securely collect the information required for your {customerType === "business" ? "KYB" : "KYC"}.
              You will return here when finished.
            </p>
          </div>
        </Centered>
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button onClick={() => send({ type: "START_OAUTH" })}>
            Continue to Monerium
            <ExternalLink className="size-4" />
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (value === "InReview") {
    return (
      <>
        <Centered>
          <ShieldCheck className="size-10 text-primary" />
          <div>
            <p className="font-medium">Verification in review</p>
            <p className="text-muted-foreground text-sm">Monerium is reviewing your information. You can return later.</p>
          </div>
        </Centered>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Continue in background
          </Button>
          <Button onClick={() => send({ type: "REFRESH" })}>Refresh status</Button>
        </DialogFooter>
      </>
    );
  }

  if (value === "Approved") {
    return (
      <>
        <Centered>
          <CheckCircle2 className="size-10 text-success" />
          <div>
            <p className="font-medium">Approved</p>
            <p className="text-muted-foreground text-sm">Your {corridor.name} onboarding is complete.</p>
          </div>
        </Centered>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  if (value === "Rejected" || value === "Failure") {
    return (
      <>
        <Centered>
          <AlertTriangle className="size-10 text-destructive" />
          <div>
            <p className="font-medium">{value === "Rejected" ? "Verification was not approved" : "Could not continue"}</p>
            <p className="text-muted-foreground text-sm">{state.context.error?.message ?? "Contact support or try again."}</p>
          </div>
        </Centered>
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
          <Button onClick={() => send({ type: "RETRY" })}>Try again</Button>
        </DialogFooter>
      </>
    );
  }

  return null;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-8 text-center">{children}</div>;
}
