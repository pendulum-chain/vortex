import type { AveniaKycFormData, UploadIds } from "@vortexfi/kyc";
import { createAveniaKycApi, createAveniaKycMachine } from "@vortexfi/kyc";
import { useMachine } from "@xstate/react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import type { Corridor, OnboardingStatus } from "@/domain/types";
import { apiClient } from "@/services/api/api-client";
import { AveniaDocumentUploadScreen } from "./AveniaDocumentUploadScreen";
import { AveniaKycFormScreen } from "./AveniaKycFormScreen";
import { AveniaLivenessScreen } from "./AveniaLivenessScreen";

interface AveniaKycFlowProps {
  corridor: Corridor;
  onClose: () => void;
  onSettled: (status: OnboardingStatus) => void;
}

const aveniaKycMachine = createAveniaKycMachine({
  api: createAveniaKycApi(apiClient)
});

const STATUS_BY_STATE: Record<string, OnboardingStatus> = {
  DocumentUpload: "pending",
  FormFilling: "pending",
  LivenessCheck: "pending",
  RefreshingLivenessUrl: "pending",
  Submit: "in_review",
  Success: "approved",
  Verifying: "in_review"
};

const BUSY_STATES = new Set(["SubaccountSetup", "Submit", "Verifying"]);

export function AveniaKycFlow({ corridor, onClose, onSettled }: AveniaKycFlowProps) {
  const [state, send] = useMachine(aveniaKycMachine, { input: { taxId: "" } });
  const value = String(state.value);

  const reported = useRef<OnboardingStatus | null>(null);
  useEffect(() => {
    const status = STATUS_BY_STATE[value];
    if (!status || reported.current === status) return;
    reported.current = status;
    onSettled(status);
  }, [value, onSettled]);

  if (BUSY_STATES.has(value)) {
    return (
      <>
        <Centered>
          <Loader2 className="size-8 animate-spin text-primary" />
          <div>
            <p className="font-medium">
              {value === "SubaccountSetup" ? "Creating your Avenia profile" : "Submitting your application"}
            </p>
            <p className="text-muted-foreground text-sm">This can take a moment while Avenia processes your information.</p>
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

  if (value === "FormFilling") {
    return (
      <AveniaKycFormScreen
        initialData={state.context.kycFormData}
        onCancel={onClose}
        onSubmit={(formData: AveniaKycFormData) => send({ formData, type: "FORM_SUBMIT" })}
      />
    );
  }

  if (value === "DocumentUpload") {
    return (
      <AveniaDocumentUploadScreen
        onBack={() => send({ type: "DOCUMENTS_BACK" })}
        onSubmit={(documentsId: UploadIds) => send({ documentsId, type: "DOCUMENTS_SUBMIT" })}
        taxId={state.context.taxId}
      />
    );
  }

  if (value === "LivenessCheck" || value === "RefreshingLivenessUrl") {
    return (
      <AveniaLivenessScreen
        isOpened={state.context.livenessCheckOpened === true}
        isRefreshing={value === "RefreshingLivenessUrl"}
        livenessUrl={state.context.documentUploadIds?.livenessUrl}
        onBack={() => send({ type: "GO_BACK" })}
        onDone={() => send({ type: "LIVENESS_DONE" })}
        onOpen={() => send({ type: "LIVENESS_OPENED" })}
        onRefresh={() => send({ type: "REFRESH_LIVENESS_URL" })}
      />
    );
  }

  if (value === "Success") {
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
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  if (value === "Failure" || value === "Rejected") {
    return (
      <>
        <Centered>
          <AlertTriangle className="size-10 text-destructive" />
          <div>
            <p className="font-medium">Something went wrong</p>
            <p className="text-muted-foreground text-sm">
              {state.context.error?.message ?? state.context.rejectReason ?? "Please try again."}
            </p>
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
