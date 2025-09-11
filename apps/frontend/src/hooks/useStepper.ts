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

  const { isKycActive, isKycComplete, isKycFailure, isRegisterOrUpdate, rampPaymentConfirmed, rampSummaryVisible } =
    useSelector(rampActor, state => ({
      isKycActive: state.matches("KYC"),
      isKycComplete: state.matches("KycComplete"),
      isKycFailure: state.matches("KycFailure"),
      isRegisterOrUpdate: state.matches("RegisterRamp") || state.matches("UpdateRamp"),
      rampPaymentConfirmed: state.context.rampPaymentConfirmed,
      rampSummaryVisible: state.matches("KycComplete")
    }));

  const secondStepActive = isKycComplete || isKycActive || isKycFailure;
  const secondStepComplete = isKycComplete || isRegisterOrUpdate || rampPaymentConfirmed;

  const thirdStepActive = secondStepComplete && rampSummaryVisible;
  const thirdStepComplete = rampPaymentConfirmed;

  const steps = useMemo((): Step[] => {
    return [
      {
        Icon: DetailsIcon,
        status: secondStepActive || secondStepComplete ? "complete" : "active",
        title: t("stepper.details", "Details")
      },
      {
        Icon: VerificationIcon,
        status: secondStepComplete ? "complete" : secondStepActive ? "active" : "incomplete",
        title: t("stepper.verification", "Verification")
      },
      {
        Icon: ConfirmIcon,
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
