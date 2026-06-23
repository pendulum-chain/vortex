import { useMachine } from "@xstate/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { onboardingKindFor } from "@/domain/corridors";
import type { Corridor, OnboardingStatus, SenderAccount } from "@/domain/types";
import { cn } from "@/lib/cn";
import { notifyOnboardingStatus } from "@/lib/notify";
import { BRAZIL_KYB_STEPS, brazilKybMachine } from "@/machines/brazilKyb.machine";
import { BRAZIL_KYC_STEPS, brazilKycMachine } from "@/machines/brazilKyc.machine";
import { EUROPE_KYC_STEPS, europeKycMachine } from "@/machines/europeKyc.machine";
import type { WizardStep } from "@/machines/types";
import { useDashboardStore } from "@/stores/dashboard.store";
import { WizardStepFields } from "./WizardStepFields";

interface OnboardingWizardProps {
  account: SenderAccount;
  corridor: Corridor;
  onClose: () => void;
}

function selectFlow(corridor: Corridor, account: SenderAccount) {
  const kind = onboardingKindFor(corridor, account.type);
  if (corridor.id === "BR") {
    return kind === "kyb"
      ? { kind, machine: brazilKybMachine, steps: BRAZIL_KYB_STEPS }
      : { kind, machine: brazilKycMachine, steps: BRAZIL_KYC_STEPS };
  }
  return { kind, machine: europeKycMachine, steps: EUROPE_KYC_STEPS };
}

export function OnboardingWizard({ account, corridor, onClose }: OnboardingWizardProps) {
  const setOnboardingStatus = useDashboardStore(state => state.setOnboardingStatus);
  const { machine, steps, kind } = useMemo(() => selectFlow(corridor, account), [corridor, account]);

  const [state, send] = useMachine(machine, {
    input: {
      onStatusChange: (status: OnboardingStatus) => {
        setOnboardingStatus(account.id, corridor.id, status);
        notifyOnboardingStatus(corridor.name, kind, status);
      }
    }
  });

  const value = String(state.value);
  const stepIndex = steps.findIndex(step => step.id === value);
  const activeStep: WizardStep | undefined = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const isProcessing = value === "verifying" || value === "review";
  const isApproved = value === "approved";

  return (
    <Dialog onOpenChange={isOpen => !isOpen && onClose()} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{corridor.flag}</span>
            {corridor.name} {kind.toUpperCase()}
          </DialogTitle>
          <DialogDescription>
            {account.name} · {corridor.provider === "avenia" ? "Avenia" : "Mykobo"}
          </DialogDescription>
        </DialogHeader>

        {activeStep && <Stepper currentIndex={stepIndex} steps={steps} />}

        <div className="min-h-[200px] py-2">
          {activeStep && (
            <div className="grid gap-4">
              <div>
                <h3 className="font-medium text-sm">{activeStep.title}</h3>
                <p className="text-muted-foreground text-sm">{activeStep.description}</p>
              </div>
              <WizardStepFields stepId={activeStep.id} />
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <Loader2 className="size-8 animate-spin text-primary" />
              <div>
                <p className="font-medium">{value === "verifying" ? "Submitting your application" : "In review"}</p>
                <p className="text-muted-foreground text-sm">
                  {value === "verifying"
                    ? "Sending your details to the verification provider…"
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
          {activeStep && (
            <>
              <Button onClick={onClose} variant="ghost">
                Cancel
              </Button>
              {stepIndex > 0 && (
                <Button onClick={() => send({ type: "BACK" })} variant="outline">
                  Back
                </Button>
              )}
              {isLastStep ? (
                <Button onClick={() => send({ type: "SUBMIT" })}>Submit application</Button>
              ) : (
                <Button onClick={() => send({ type: "NEXT" })}>Continue</Button>
              )}
            </>
          )}
          {isProcessing && (
            <Button onClick={onClose} variant="outline">
              Continue in background
            </Button>
          )}
          {isApproved && <Button onClick={onClose}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ steps, currentIndex }: { steps: WizardStep[]; currentIndex: number }) {
  const effectiveIndex = currentIndex === -1 ? steps.length : currentIndex;
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, index) => (
        <div className="flex flex-1 items-center gap-2" key={step.id}>
          <div
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full font-medium text-xs",
              index < effectiveIndex && "bg-success text-success-foreground",
              index === effectiveIndex && "bg-primary text-primary-foreground",
              index > effectiveIndex && "bg-muted text-muted-foreground"
            )}
          >
            {index + 1}
          </div>
          {index < steps.length - 1 && (
            <div className={cn("h-0.5 flex-1 rounded-full", index < effectiveIndex ? "bg-success" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  );
}
