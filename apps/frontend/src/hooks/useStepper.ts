import {
  CheckCircleIcon as ConfirmIcon,
  DocumentTextIcon as DetailsIcon,
  UserCircleIcon as LoginIcon,
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
    isAuthenticated,
    isKycActive,
    isKycComplete,
    isKycFailure,
    isRegisterOrUpdate,
    rampPaymentConfirmed,
    rampSummaryVisible,
    rampFollowUp,
    redirectCallback
  } = useSelector(rampActor, state => ({
    isAuthenticated: state.context.isAuthenticated,
    isKycActive: state.matches("KYC"),
    isKycComplete: state.matches("KycComplete"),
    isKycFailure: state.matches("KycFailure"),
    isRegisterOrUpdate: state.matches("RegisterRamp") || state.matches("UpdateRamp"),
    rampFollowUp: state.matches("RampFollowUp"),
    rampPaymentConfirmed: state.context.rampPaymentConfirmed,
    rampSummaryVisible: state.matches("KycComplete"),
    redirectCallback: state.matches("RedirectCallback")
  }));

  // Step 1: Login - complete when authenticated
  const loginStepComplete = isAuthenticated;

  // Step 2: Details - active after login, complete when KYC starts
  const detailsStepActive = isAuthenticated && !isKycActive && !isKycComplete && !isKycFailure;
  const detailsStepComplete = isKycComplete || isKycActive || isKycFailure;

  // Step 3: Verification - active during KYC, complete when done
  const verificationStepActive = isKycActive || isKycFailure;
  const verificationStepComplete =
    rampFollowUp || redirectCallback || isKycComplete || isRegisterOrUpdate || rampPaymentConfirmed;

  // Step 4: Confirm - active when verification complete, complete when payment confirmed
  const confirmStepActive = verificationStepComplete && rampSummaryVisible;
  const confirmStepComplete = rampFollowUp || redirectCallback || rampPaymentConfirmed;

  const steps = useMemo((): Step[] => {
    return [
      {
        Icon: LoginIcon,
        status: loginStepComplete ? "complete" : "active",
        title: t("components.stepper.login", "Login")
      },
      {
        Icon: DetailsIcon,
        status: detailsStepComplete ? "complete" : detailsStepActive ? "active" : "incomplete",
        title: t("components.stepper.details", "Details")
      },
      {
        Icon: VerificationIcon,
        status: verificationStepComplete ? "complete" : verificationStepActive ? "active" : "incomplete",
        title: t("components.stepper.verification", "Verification")
      },
      {
        Icon: ConfirmIcon,
        status: confirmStepComplete ? "complete" : confirmStepActive ? "active" : "incomplete",
        title: t("components.stepper.confirm", "Confirm")
      }
    ];
  }, [
    t,
    loginStepComplete,
    detailsStepActive,
    detailsStepComplete,
    verificationStepActive,
    verificationStepComplete,
    confirmStepActive,
    confirmStepComplete
  ]);

  const currentStep = useMemo(() => {
    return steps.findIndex(step => step.status === "active");
  }, [steps]);

  return {
    currentStep: currentStep >= 0 ? currentStep : 0,
    steps
  };
};
