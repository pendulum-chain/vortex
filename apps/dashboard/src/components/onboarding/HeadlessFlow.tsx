import { useMachine } from "@xstate/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import type { Corridor, OnboardingKind, OnboardingStatus } from "@/domain/types";
import { cn } from "@/lib/cn";
import { headlessOnboardingMachine } from "@/machines/headlessOnboarding.machine";
import type { WizardStep } from "@/machines/types";
import { WizardStepFields } from "./WizardStepFields";

interface HeadlessFlowProps {
  corridor: Corridor;
  kind: OnboardingKind;
  steps: WizardStep[];
  onStatusChange: (status: OnboardingStatus) => void;
  onClose: () => void;
}

export function HeadlessFlow({ corridor, kind, steps, onStatusChange, onClose }: HeadlessFlowProps) {
  const [state, send] = useMachine(headlessOnboardingMachine, { input: { onStatusChange, stepCount: steps.length } });

  const value = String(state.value);
  const stepIndex = state.context.stepIndex;
  const activeStep: WizardStep | undefined = value === "form" ? steps[stepIndex] : undefined;
  const isLastStep = stepIndex === steps.length - 1;
  const isProcessing = value === "verifying" || value === "review";
  const isApproved = value === "approved";

  return (
    <>
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
    </>
  );
}

function Stepper({ steps, currentIndex }: { steps: WizardStep[]; currentIndex: number }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, index) => (
        <div className="flex flex-1 items-center gap-2" key={step.id}>
          <div
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full font-medium text-xs",
              index < currentIndex && "bg-success text-success-foreground",
              index === currentIndex && "bg-primary text-primary-foreground",
              index > currentIndex && "bg-muted text-muted-foreground"
            )}
          >
            {index + 1}
          </div>
          {index < steps.length - 1 && (
            <div className={cn("h-0.5 flex-1 rounded-full", index < currentIndex ? "bg-success" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  );
}
