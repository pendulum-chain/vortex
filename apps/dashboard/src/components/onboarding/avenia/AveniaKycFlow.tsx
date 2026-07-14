import type { AveniaKycFormData, UploadIds } from "@vortexfi/kyc";
import { createAveniaKycApi, createAveniaKycMachine, KycStatus } from "@vortexfi/kyc";
import { useMachine } from "@xstate/react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import type { Corridor, OnboardingStatus } from "@/domain/types";
import { apiClient } from "@/services/api/api-client";
import { AveniaDocumentUploadScreen } from "./AveniaDocumentUploadScreen";
import { AveniaKybFormScreen } from "./AveniaKybFormScreen";
import { AveniaKybHostedStep } from "./AveniaKybHostedStep";
import { AveniaKycFormScreen } from "./AveniaKycFormScreen";
import { AveniaLivenessScreen } from "./AveniaLivenessScreen";

interface AveniaKycFlowProps {
  business?: boolean;
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

export function AveniaKycFlow({ business = false, corridor, onClose, onSettled }: AveniaKycFlowProps) {
  const [state, send] = useMachine(aveniaKycMachine, { input: { taxId: "" } });
  const value = String(state.value);
  const isCompanyVerification = state.matches({ KYBFlow: "CompanyVerification" });
  const isRepresentativeVerification = state.matches({ KYBFlow: "RepresentativeVerification" });
  const isStatusVerification = state.matches({ KYBFlow: "StatusVerification" });

  const reported = useRef<OnboardingStatus | null>(null);
  useEffect(() => {
    const status = isStatusVerification
      ? state.context.kycStatus === KycStatus.APPROVED
        ? "approved"
        : state.context.kycStatus === KycStatus.REJECTED
          ? "rejected"
          : "in_review"
      : STATUS_BY_STATE[value];
    if (!status || reported.current === status) return;
    reported.current = status;
    onSettled(status);
  }, [value, isStatusVerification, state.context.kycStatus, onSettled]);

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
        {value !== "SubaccountSetup" && (
          <DialogFooter>
            <Button onClick={onClose} variant="outline">
              Continue in background
            </Button>
          </DialogFooter>
        )}
      </>
    );
  }

  if (value === "FormFilling") {
    if (business) {
      return (
        <AveniaKybFormScreen
          initialData={state.context.kycFormData}
          onCancel={onClose}
          onSubmit={(formData: AveniaKycFormData) => send({ formData, type: "FORM_SUBMIT" })}
        />
      );
    }
    return (
      <AveniaKycFormScreen
        initialData={state.context.kycFormData}
        onCancel={onClose}
        onSubmit={(formData: AveniaKycFormData) => send({ formData, type: "FORM_SUBMIT" })}
      />
    );
  }

  if (isCompanyVerification && state.context.kybUrls) {
    return (
      <AveniaKybHostedStep
        description="Provide Avenia with the company registration information and supporting documents."
        isOpened={state.context.companyVerificationStarted === true}
        onBack={() => send({ type: "GO_BACK" })}
        onDone={() => send({ type: "KYB_COMPANY_DONE" })}
        onOpen={() => send({ type: "COMPANY_VERIFICATION_STARTED" })}
        title="Verify your company"
        url={state.context.kybUrls.basicCompanyDataUrl}
      />
    );
  }

  if (isRepresentativeVerification && state.context.kybUrls) {
    return (
      <AveniaKybHostedStep
        description="The authorized representative must complete identity verification with Avenia."
        isOpened={state.context.representativeVerificationStarted === true}
        onBack={() => send({ type: "KYB_COMPANY_BACK" })}
        onDone={() => send({ type: "KYB_REPRESENTATIVE_DONE" })}
        onOpen={() => send({ type: "REPRESENTATIVE_VERIFICATION_STARTED" })}
        title="Verify the company representative"
        url={state.context.kybUrls.authorizedRepresentativeUrl}
      />
    );
  }

  if (isStatusVerification) {
    const isApproved = state.context.kycStatus === KycStatus.APPROVED;
    const isRejected = state.context.kycStatus === KycStatus.REJECTED;
    return (
      <>
        <Centered>
          {isApproved ? (
            <CheckCircle2 className="size-10 text-success" />
          ) : isRejected ? (
            <AlertTriangle className="size-10 text-destructive" />
          ) : (
            <Loader2 className="size-8 animate-spin text-primary" />
          )}
          <div>
            <p className="font-medium">{isApproved ? "Approved" : isRejected ? "Verification failed" : "In review"}</p>
            <p className="text-muted-foreground text-sm">
              {isApproved
                ? "Your Brazil KYB is complete."
                : isRejected
                  ? (state.context.rejectReason ?? "Avenia rejected the application.")
                  : "Avenia is reviewing the company and representative information."}
            </p>
          </div>
        </Centered>
        <DialogFooter>
          {isRejected ? (
            <Button onClick={() => send({ type: "RETRY" })}>Try again</Button>
          ) : (
            <Button
              onClick={() => {
                if (isApproved) send({ type: "CLOSE_SUCCESS_MODAL" });
                onClose();
              }}
              variant={isApproved ? "default" : "outline"}
            >
              {isApproved ? "Done" : "Continue in background"}
            </Button>
          )}
        </DialogFooter>
      </>
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
            <p className="text-muted-foreground text-sm">
              {corridor.name} {business ? "KYB" : "KYC"} is complete. You can now register recipients.
            </p>
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
