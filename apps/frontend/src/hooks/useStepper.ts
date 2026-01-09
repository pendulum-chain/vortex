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
    isRegister,
    isUpdate,
    rampPaymentConfirmed,
    rampSummaryVisible,
    rampFollowUp,
    redirectCallback,
    isError
  } = useSelector(rampActor, state => ({
    isAuthenticated: state.context.isAuthenticated,
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

  // Step 3: Verification - active during KYC, complete when done
  const verificationStepActive = isKycActive || isKycFailure;
  const verificationStepComplete =
    rampFollowUp || redirectCallback || isKycComplete || isRegister || isUpdate || rampPaymentConfirmed;

  // Step 4: Confirm - active when verification complete, complete when payment confirmed
  const confirmStepActive = verificationStepComplete && (rampSummaryVisible || isRegisterOrUpdate);
  const confirmStepComplete = rampFollowUp || redirectCallback || rampPaymentConfirmed;

  // Step 2: Details - active after login, complete when KYC starts
  const detailsStepActive = isAuthenticated && !isKycActive && !isKycComplete && !isKycFailure;
  const detailsStepComplete = verificationStepComplete || isKycComplete || isKycActive || isKycFailure;

  // Step 1: Login - complete when authenticated
  const loginStepComplete = isAuthenticated;

  const steps = useMemo((): Step[] => {
    return [
      {
        Icon: LoginIcon,
        status: loginStepComplete ? "complete" : "active",
        title: t("components.stepper.login", "Login")
      },
      {
        Icon: DetailsIcon,
        status: isError ? "error" : detailsStepComplete ? "complete" : detailsStepActive ? "active" : "incomplete",
        title: t("components.stepper.details", "Details")
      },
      {
        Icon: VerificationIcon,
        status: isError ? "error" : verificationStepComplete ? "complete" : verificationStepActive ? "active" : "incomplete",
        title: t("components.stepper.verification", "Verification")
      },
      {
        Icon: ConfirmIcon,
        status: isError ? "error" : confirmStepComplete ? "complete" : confirmStepActive ? "active" : "incomplete",
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
