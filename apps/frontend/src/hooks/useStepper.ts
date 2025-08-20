import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Step } from "../components/Stepper";
import { useRampActor } from "../contexts/rampState";

export const useStepper = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();

  const { rampKycStarted, rampPaymentConfirmed, rampSummaryVisible, state } = useSelector(rampActor, state => ({
    rampKycStarted: state.context.rampKycStarted,
    rampPaymentConfirmed: state.context.rampPaymentConfirmed,
    rampSummaryVisible: state.context.rampSummaryVisible,
    state: state.value
  }));

  const secondStepActive = state === "KycComplete" || rampKycStarted;
  const secondStepComplete = state === "KycComplete" || rampPaymentConfirmed;

  const thirdStepActive = secondStepComplete && rampSummaryVisible;
  const thirdStepComplete = rampPaymentConfirmed;

  const steps = useMemo((): Step[] => {
    return [
      {
        status: secondStepActive || secondStepComplete ? "complete" : "active",
        title: t("stepper.details", "Details")
      },
      {
        status: secondStepComplete ? "complete" : secondStepActive ? "active" : "incomplete",
        title: t("stepper.verification", "Verification")
      },
      {
        status: thirdStepComplete ? "complete" : thirdStepActive ? "active" : "incomplete",
        title: t("stepper.confirm", "Confirm")
      }
    ];
  }, [t, secondStepActive, secondStepComplete, thirdStepActive, thirdStepComplete]);

  const currentStep = useMemo(() => {
    return steps.findIndex(step => step.status === "active");
  }, [steps]);

  return {
    currentStep: currentStep >= 0 ? currentStep : 0,
    steps
  };
};
