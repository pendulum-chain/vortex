import {
  CheckCircleIcon as ConfirmIcon,
  DocumentTextIcon as DetailsIcon,
  DocumentCheckIcon as VerificationIcon
} from "@heroicons/react/24/outline";
import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Step } from "../components/Stepper";
import { useRampActor } from "../contexts/rampState";

export const useStepper = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();

  const {
    isKycActive,
    isKycComplete,
    isKycFailure,
    isRegister,
    isUpdate,
    rampPaymentConfirmed,
    rampSummaryVisible,
    rampFollowUp,
    redirectCallback,
    isError
  } = useSelector(rampActor, state => ({
    isError: state.matches("Error"),
    isKycActive: state.matches("KYC"),
    isKycComplete: state.matches("KycComplete"),
    isKycFailure: state.matches("KycFailure"),
    isRegister: state.matches("RegisterRamp"),
    isUpdate: state.matches("UpdateRamp"),
    rampFollowUp: state.matches("RampFollowUp"),
    rampPaymentConfirmed: state.context.rampPaymentConfirmed,
    rampSummaryVisible: state.matches("KycComplete"),
    redirectCallback: state.matches("RedirectCallback")
  }));

  const secondStepActive = isKycComplete || isKycActive || isKycFailure;
  const secondStepComplete =
    rampFollowUp || redirectCallback || isKycComplete || isRegister || isUpdate || rampPaymentConfirmed;

  const thirdStepActive = secondStepComplete && rampSummaryVisible;
  const thirdStepComplete = rampFollowUp || redirectCallback || rampPaymentConfirmed || isRegister;

  const steps = useMemo((): Step[] => {
    return [
      {
        Icon: DetailsIcon,
        status: isError ? "error" : secondStepActive || secondStepComplete ? "complete" : "active",
        title: t("components.stepper.details", "Details")
      },
      {
        Icon: VerificationIcon,
        status: isError ? "error" : secondStepComplete ? "complete" : secondStepActive ? "active" : "incomplete",
        title: t("components.stepper.verification", "Verification")
      },
      {
        Icon: ConfirmIcon,
        status: isError ? "error" : thirdStepComplete ? "complete" : thirdStepActive ? "active" : "incomplete",
        title: t("components.stepper.confirm", "Confirm")
      }
    ];
  }, [t, secondStepActive, secondStepComplete, thirdStepActive, thirdStepComplete, isError]);

  const currentStep = useMemo(() => {
    return steps.findIndex(step => step.status === "active");
  }, [steps]);

  return {
    currentStep: currentStep >= 0 ? currentStep : 0,
    steps
  };
};
