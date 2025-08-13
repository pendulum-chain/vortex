import { RampDirection } from "@packages/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Step } from "../components/Stepper";
import { useRampDirection } from "../stores/rampDirectionStore";
import {
  useRampKycLevel2Started,
  useRampKycStarted,
  useRampPaymentConfirmed,
  useRampRegistered,
  useRampSigningPhase,
  useRampStarted
} from "../stores/rampStore";

export const useStepper = () => {
  const { t } = useTranslation();
  const rampDirection = useRampDirection();
  const rampStarted = useRampStarted();
  const rampRegistered = useRampRegistered();
  const rampSigningPhase = useRampSigningPhase();
  const rampPaymentConfirmed = useRampPaymentConfirmed();
  const rampKycStarted = useRampKycStarted();
  const rampKycLevel2Started = useRampKycLevel2Started();

  const steps = useMemo((): Step[] => {
    const isOnramp = rampDirection === RampDirection.BUY;

    if (isOnramp) {
      return [
        {
          status: "complete",
          title: t("stepper.quote", "Quote")
        },
        {
          status: rampPaymentConfirmed ? "complete" : rampRegistered ? "active" : "incomplete",
          title: t("stepper.payment", "Payment")
        },
        {
          status: rampStarted ? "active" : rampPaymentConfirmed ? "active" : "incomplete",
          title: t("stepper.processing", "Processing")
        },
        {
          status: "incomplete",
          title: t("stepper.complete", "Complete")
        }
      ];
    } else {
      // Offramp flow: Quote → KYC (if needed) → Sign → Processing → Complete
      const steps: Step[] = [
        {
          status: "complete",
          title: t("stepper.quote", "Quote")
        }
      ];

      // Add KYC step if it's required (for BRLA transactions)
      if (rampKycStarted || rampKycLevel2Started) {
        steps.push({
          status: rampRegistered ? "complete" : "active",
          title: t("stepper.kyc", "KYC")
        });
      }

      steps.push(
        {
          status:
            rampSigningPhase === "signed" || rampSigningPhase === "finished"
              ? "complete"
              : rampSigningPhase === "started" || rampSigningPhase === "approved"
                ? "active"
                : rampRegistered
                  ? "active"
                  : "incomplete",
          title: t("stepper.sign", "Sign")
        },
        {
          status: rampStarted
            ? "active"
            : rampSigningPhase === "signed" || rampSigningPhase === "finished"
              ? "active"
              : "incomplete",
          title: t("stepper.processing", "Processing")
        },
        {
          status: "incomplete",
          title: t("stepper.complete", "Complete")
        }
      );

      return steps;
    }
  }, [
    t,
    rampDirection,
    rampStarted,
    rampRegistered,
    rampSigningPhase,
    rampPaymentConfirmed,
    rampKycStarted,
    rampKycLevel2Started
  ]);

  const currentStep = useMemo(() => {
    return steps.findIndex(step => step.status === "active");
  }, [steps]);

  return {
    currentStep: currentStep >= 0 ? currentStep : 0,
    steps
  };
};
