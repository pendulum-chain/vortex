import type { AlfredpayKycFormData, MxnKycFiles } from "@vortexfi/kyc";
import { useMachine } from "@xstate/react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import type { Corridor, OnboardingStatus } from "@/domain/types";
import { alfredpayKycMachine } from "@/machines/alfredpayKyc.machine";
import { CORRIDOR_COUNTRY } from "@/services/api/mappers";
import { DocumentUploadScreen } from "./DocumentUploadScreen";
import { type AlfredpayKycCountry, KycFormScreen } from "./KycFormScreen";

interface AlfredpayKycFlowProps {
  corridor: Corridor;
  /** Fired once per status the provider reports, so the caller can notify and refetch. */
  onSettled: (status: OnboardingStatus) => void;
  onClose: () => void;
  userEmail?: string;
}

/** Machine states that correspond to a status the rest of the dashboard cares about. */
const STATUS_BY_STATE: Record<string, OnboardingStatus> = {
  FailureKyc: "rejected",
  PollingStatus: "in_review",
  VerificationDone: "approved"
};

const BUSY_STATES = new Set([
  "CheckingStatus",
  "CreatingCustomer",
  "SubmittingKycInfo",
  "SubmittingFiles",
  "SendingSubmission",
  "Retrying"
]);

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-8 text-center">{children}</div>;
}

export function AlfredpayKycFlow({ corridor, onSettled, onClose, userEmail }: AlfredpayKycFlowProps) {
  const [state, send] = useMachine(alfredpayKycMachine, { input: { country: CORRIDOR_COUNTRY[corridor.id] } });

  const value = String(state.value);
  const { error, country } = state.context;

  const reported = useRef<OnboardingStatus | null>(null);
  useEffect(() => {
    const status = STATUS_BY_STATE[value];
    if (!status || reported.current === status) {
      return;
    }
    reported.current = status;
    onSettled(status);
  }, [value, onSettled]);

  if (BUSY_STATES.has(value)) {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Talking to Alfredpay…</p>
      </Centered>
    );
  }

  if (value === "CustomerDefinition") {
    return (
      <>
        <Centered>
          <p className="max-w-sm text-muted-foreground text-sm">
            We'll create your {corridor.name} verification profile with Alfredpay, then collect your details.
          </p>
        </Centered>
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button onClick={() => send({ type: "USER_ACCEPT" })}>Continue</Button>
        </DialogFooter>
      </>
    );
  }

  if (value === "FillingKycForm") {
    // Only MX/CO/AR reach this state: US redirects to the provider, and the wizard only mounts
    // this flow for Alfredpay corridors on the headless route.
    return (
      <KycFormScreen
        country={country as AlfredpayKycCountry}
        onCancel={onClose}
        onSubmit={(data: AlfredpayKycFormData) => send({ data, type: "SUBMIT_FORM" })}
        userEmail={userEmail}
      />
    );
  }

  if (value === "UploadingDocuments") {
    return (
      <DocumentUploadScreen
        error={error?.message}
        includeSelfie={country === "AR"}
        onBack={() => send({ type: "GO_BACK" })}
        onSubmit={(files: MxnKycFiles) => send({ files, type: "SUBMIT_FILES" })}
      />
    );
  }

  if (value === "PollingStatus") {
    return (
      <>
        <Centered>
          <Loader2 className="size-8 animate-spin text-primary" />
          <div>
            <p className="font-medium">In review</p>
            <p className="text-muted-foreground text-sm">
              Alfredpay is reviewing your submission. We'll email you when it's complete.
            </p>
          </div>
        </Centered>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Continue in background
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (value === "VerificationDone") {
    return (
      <>
        <Centered>
          <CheckCircle2 className="size-10 text-success" />
          <div>
            <p className="font-medium">Approved</p>
            <p className="text-muted-foreground text-sm">{corridor.name} KYC is complete. You can now register recipients.</p>
          </div>
        </Centered>
        <DialogFooter>
          <Button
            onClick={() => {
              send({ type: "CONFIRM_SUCCESS" });
              onClose();
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </>
    );
  }

  // `FailureKyc` is the provider rejecting the submission; `Failure` is our call to them failing.
  if (value === "FailureKyc" || value === "Failure") {
    const isProviderRejection = value === "FailureKyc";
    return (
      <>
        <Centered>
          <AlertTriangle className="size-10 text-destructive" />
          <div>
            <p className="font-medium">{isProviderRejection ? "Verification failed" : "Something went wrong"}</p>
            <p className="text-muted-foreground text-sm">{error?.message ?? "Please try again."}</p>
          </div>
        </Centered>
        <DialogFooter>
          <Button
            onClick={() => {
              send({ type: isProviderRejection ? "USER_CANCEL" : "CANCEL_PROCESS" });
              onClose();
            }}
            variant="ghost"
          >
            Close
          </Button>
          <Button onClick={() => send({ type: isProviderRejection ? "USER_RETRY" : "RETRY_PROCESS" })}>Try again</Button>
        </DialogFooter>
      </>
    );
  }

  return null;
}
