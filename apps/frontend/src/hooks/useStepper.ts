import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import ConfirmIcon from "../assets/steps/confirm.png";
import DetailsIcon from "../assets/steps/details.png";
import VerificationIcon from "../assets/steps/verification.png";
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
  const secondStepComplete =
    state === "KycComplete" || state === "RegisterRamp" || state === "UpdateRamp" || rampPaymentConfirmed;

  const thirdStepActive = secondStepComplete && rampSummaryVisible;
  const thirdStepComplete = rampPaymentConfirmed;

  const steps = useMemo((): Step[] => {
    return [
      {
        icon: DetailsIcon,
        status: secondStepActive || secondStepComplete ? "complete" : "active",
        title: t("stepper.details", "Details")
      },
      {
        icon: VerificationIcon,
        status: secondStepComplete ? "complete" : secondStepActive ? "active" : "incomplete",
        title: t("stepper.verification", "Verification")
      },
      {
        icon: ConfirmIcon,
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
